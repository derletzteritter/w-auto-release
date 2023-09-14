import { Octokit } from "@octokit/rest";
import * as core from "@actions/core";
import { Context } from "@actions/github/lib/context";
import { Endpoints } from "@octokit/types";
import semverValid from "semver/functions/valid";
import semverRcompare from "semver/functions/rcompare";
import semverLt from "semver/functions/lt";

type ActionArgs = {
  repoToken: string;
  title: string;
  preRelease: boolean;
  automaticReleaseTag: string;
};

type CreateReleaseParams =
  Endpoints["POST /repos/{owner}/{repo}/releases"]["parameters"];

type GitGetRefParams =
  Endpoints["GET /repos/{owner}/{repo}/git/ref/{ref}"]["parameters"];

type CreateRefParams =
  Endpoints["POST /repos/{owner}/{repo}/git/refs"]["parameters"];

type ReposListTagsParams =
  Endpoints["GET /repos/{owner}/{repo}/tags"]["parameters"];

type GetReleaseByTagParams =
  Endpoints["GET /repos/{owner}/{repo}/releases/tags/{tag}"]["parameters"];

type OctokitClient = InstanceType<typeof Octokit>;

function validateArgs(): ActionArgs {
  const args = {
    repoToken: core.getInput("repo_token", { required: true }),
    title: core.getInput("title", { required: false }),
    preRelease: JSON.parse(core.getInput("prerelease", { required: false })),
    automaticReleaseTag: core.getInput("automatic_release_tag", {
      required: false,
    }),
  };

  return args;
}

export async function main() {
  try {
    const args = validateArgs();
    const context = new Context();

    const octokit = new Octokit({
      auth: args.repoToken,
    });

    core.startGroup("Initializing action");
    core.debug(`Github context ${JSON.stringify(context)}`);
    core.endGroup();

    core.startGroup("Getting release tags");

    const releaseTag = args.automaticReleaseTag
      ? args.automaticReleaseTag
      : parseGitTag(context.ref);

    if (!releaseTag) {
      core.setFailed("No release tag found");
      return;
    }

    const previousReleaseTag = args.automaticReleaseTag
      ? args.automaticReleaseTag
      : await searchForPreviousReleaseTag(octokit, releaseTag, {
          owner: context.repo.owner,
          repo: context.repo.repo,
        });

    core.endGroup();

    const commitsSinceRelease = await getCommitsSinceRelease(
      octokit,
      {
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `tags/${previousReleaseTag}`,
      },
      context.sha,
    );

    if (args.automaticReleaseTag) {
      await createReleaseTag(octokit, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: `refs/tags/${args.automaticReleaseTag}`,
        sha: context.sha,
      });

      await deletePreviousGithubRelease(octokit, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag: args.automaticReleaseTag,
      });
    }

    await createNewRelease(octokit, {
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: releaseTag,
    });
  } catch (err) {
    if (err instanceof Error) {
      core.setFailed(err?.message);
      throw err;
    }

    core.setFailed("An unexpected error occurred");
    throw err;
  }
}

async function createReleaseTag(
  octokit: OctokitClient,
  refInfo: CreateRefParams,
) {
  core.startGroup("Creating release tag");

  const tagName = refInfo.ref.substring(5);

  core.info(`Attempting to create or update tag ${tagName}`);

  try {
    await octokit.git.createRef(refInfo);
  } catch (err) {
    const existingTag = refInfo.ref.substring(5);
    core.info(`Tag ${existingTag} already exists, attempting to update`);

    await octokit.git.updateRef({
      ...refInfo,
      ref: existingTag,
      force: true,
    });
  }

  core.info(`Successfully created or updated tag ${tagName}`);
  core.endGroup();
}

async function createNewRelease(
  octokit: OctokitClient,
  params: CreateReleaseParams,
): Promise<string> {
  core.startGroup(`Generating new release for the ${params.tag_name} tag`);

  core.info("Creating new release");
  const resp = await octokit.repos.createRelease(params);

  core.endGroup();

  return resp.data.upload_url;
}

function parseGitTag(ref: string) {
  const re = /^(refs\/)?tags\/(.*)$/;
  const match = ref.match(re);

  if (!match || !match[2]) {
    core.debug(`Input does not look like a valid git tag: ${ref}`);
    return "";
  }

  return match[2];
}

async function searchForPreviousReleaseTag(
  octokit: OctokitClient,
  currentReleaseTag: string,
  tagInfo: ReposListTagsParams,
) {
  const validSemver = semverValid(currentReleaseTag);
  if (!validSemver) {
    core.setFailed("No valid semver tag found");
    return;
  }

  const listTagsOptions = octokit.repos.listTags.endpoint.merge(tagInfo);
  const tl = await octokit.paginate(listTagsOptions);

  const tagList = tl
    .map((tag: any) => {
      core.debug(`Found tag ${tag.name}`);
      const t = semverValid(tag.name);
      return {
        ...tag,
        semverTag: t,
      };
    })
    .filter((tag) => tag.semverTag !== null)
    .sort((a, b) => semverRcompare(a.semverTag, b.semverTag));

  let previousReleaseTag = "";
  for (const tag of tagList) {
    if (semverLt(tag.semverTag, currentReleaseTag)) {
      previousReleaseTag = tag.name;
      break;
    }
  }

  return previousReleaseTag;
}

async function getCommitsSinceRelease(
  octokit: OctokitClient,
  tagInfo: GitGetRefParams,
  currentSha: string,
) {
  core.startGroup("Fetching commit history");
  let resp;

  let previousReleaseRef = "";
  core.info(`Searching for SHA corresponding to release tag ${tagInfo.ref}`);

  try {
    await octokit.git.getRef(tagInfo);
    previousReleaseRef = parseGitTag(tagInfo.ref);
  } catch (err) {
    core.info(
      `Could not find SHA for release tag ${tagInfo.ref}. Assuming this is the first release.`,
    );
    previousReleaseRef = "HEAD";
  }

  core.info(`Fetching commits betwen ${previousReleaseRef} and ${currentSha}`);

  try {
    resp = await octokit.repos.compareCommits({
      repo: tagInfo.repo,
      owner: tagInfo.owner,
      base: previousReleaseRef,
      head: currentSha,
    });

    resp.data.commits;
    core.info(`Found ${resp.data.commits.length} commits since last release`);
  } catch (err) {
    core.warning(
      `Could not fetch commits between ${previousReleaseRef} and ${currentSha}`,
    );
  }

  let commits: any[] = [];
  if (resp?.data?.commits) {
    commits = resp.data?.commits;
  }

  core.debug(`Currently ${commits.length} commits in the list`);

  core.endGroup();
  return commits;
}

async function deletePreviousGithubRelease(
  octokit: OctokitClient,
  releaseInfo: GetReleaseByTagParams,
) {
  core.startGroup(`Deleting previous release with tag ${releaseInfo.tag}`);

  try {
    const resp = await octokit.repos.getReleaseByTag(releaseInfo);

    core.info(`Found release ${resp.data.id}, deleting`);
    await octokit.repos.deleteRelease({
      owner: releaseInfo.owner,
      repo: releaseInfo.repo,
      release_id: resp.data.id,
    });
  } catch (err) {
    core.info(`Could not find release with tag ${releaseInfo.tag}`);
  }

  core.endGroup();
}

main();
