import {Octokit} from "@octokit/rest";
import * as core from "@actions/core";
import {Context} from "@actions/github/lib/context";
import semverValid from "semver/functions/valid";
import semverRcompare from "semver/functions/rcompare";
import semverInc from "semver/functions/inc";
import recommendedBump from "recommended-bump";
import {
    ActionArgs,
    BaseheadCommits,
    CreateRefParams,
    CreateReleaseParams,
    GetReleaseByTagParams,
    GitGetRefParams,
    OctokitClient,
    ParsedCommit,
    ReposListTagsParams,
} from "./typings";
import {prerelease, ReleaseType} from "semver";

function validateArgs(): ActionArgs {
    const args = {
        repoToken: process.env.GITHUB_TOKEN as string,
        title: core.getInput("title", {required: false}),
        preRelease: JSON.parse(core.getInput("prerelease", {required: false})),
        automaticReleaseTag: core.getInput("automatic_release_tag", {
            required: false,
        }),
        environment: core.getInput("place", {required: false}) as
            | "dev"
            | "test"
            | "prod" ?? "test",
    };

    return args;
}

export async function main() {
    try {
        const args = validateArgs();
        const context = new Context();

        if (!args.repoToken) {
            core.setFailed(
                "No repo token specified. Please set the GITHUB_TOKEN environment variable.",
            );
            return;
        }

        const octokit = new Octokit({
            auth: args.repoToken,
        });

        core.debug(`Github context ${JSON.stringify(context)}`);
        core.startGroup("Initializing action");
        core.info(`Running in ${args.preRelease ? "pre-release" : "release"} mode`);
        core.endGroup();

        core.startGroup("Getting release tags");

        // since this is being triggerd from a workflow dispatch event, we need to create a new tag based on the current version

        /*const releaseTag = args.automaticReleaseTag
            ? args.automaticReleaseTag
            : parseGitTag(context.ref);*/

        /*if (!releaseTag) {
            core.setFailed("No release tag found");
            return;
        }*/
        core.endGroup();


        const previousReleaseTag = args.automaticReleaseTag
            ? args.automaticReleaseTag
            : await searchForPreviousReleaseTag(octokit, {
                owner: context.repo.owner,
                repo: context.repo.repo,
            }, args.environment);

        core.info(`Previous release tag: ${previousReleaseTag}`)

         // create new tag based on the current version

         const commitsSinceRelease = await getCommitsSinceRelease(
             octokit,
             {
                 owner: context.repo.owner,
                 repo: context.repo.repo,
                 ref: `tags/${previousReleaseTag}`,
             },
             context.sha,
         );

         const commits = commitsSinceRelease.map((commit) => {
             return commit.commit.message;
         });

         core.info(`Found ${commitsSinceRelease.length} commits since last release`);
         core.info(JSON.stringify(commits));

         const newReleaseTag = await createNewReleaseTag(previousReleaseTag, commits, args.environment);


         core.debug(`New release tag DEBUGDEBUG: ${newReleaseTag}`);
    } catch (err) {
        if (err instanceof Error) {
            core.setFailed(err?.message);
            throw err;
        }

        core.setFailed("An unexpected error occurred");
        throw err;
    }
}

const createNewReleaseTag = async (currentTag: string, commits: string[], environment: "dev" | "test" | "prod") => {
    let { increment } = recommendedBump(commits);

    if (environment === 'test') {
        const preinc = ("pre" + increment);
        // @ts-ignore
        const preTag = semverInc(currentTag, preinc, "beta");

        core.info(`New pre-release tag: ${preTag}`);
        return preTag;
    }

    const tag = semverInc(currentTag, increment);

    return tag;
}

async function searchForPreviousReleaseTag(
    octokit: OctokitClient,
    tagInfo: ReposListTagsParams,
    environment: "dev" | "test" | "prod",
) {
    /*    const validSemver = semverValid(currentReleaseTag);
        if (!validSemver) {
            core.setFailed("No valid semver tag found");
            return;
        }*/

    const listTagsOptions = octokit.repos.listTags.endpoint.merge(tagInfo);
    const tl = await octokit.paginate(listTagsOptions);

    const tagList = tl
        .map((tag: any) => {
            core.debug(`Found tag ${tag.name}`);
            if (environment === 'test') {
                const t = prerelease(tag.name);
                return {
                    ...tag,
                    semverTag: t,
                }
            } else {
                const t = semverValid(tag.name);
                return {
                    ...tag,
                    semverTag: t,
                };
            }
        })
        .filter((tag) => tag.semverTag !== null)
        .sort((a, b) => semverRcompare(a.semverTag, b.semverTag));

    // return the latest tag
    return tagList[0] ? tagList[0].name : "";
    /*
        let previousReleaseTag = "";
        for (const tag of tagList) {
            if (semverLt(tag.semverTag, currentReleaseTag)) {
                previousReleaseTag = tag.name;
                break;
            }
        }

        return previousReleaseTag;*/
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
        resp = await octokit.repos.compareCommitsWithBasehead({
            repo: tagInfo.repo,
            owner: tagInfo.owner,
            basehead: `${previousReleaseRef}...${currentSha}`,
        });

        core.info(`Found ${resp.data.commits.length} commits since last release`);
    } catch (err) {
        core.warning(
            `Could not fetch commits between ${previousReleaseRef} and ${currentSha}`,
        );
    }

    let commits: BaseheadCommits["data"]["commits"] = [];
    if (resp?.data?.commits) {
        commits = resp.data.commits;
    }

    core.debug(`Currently ${commits.length} commits in the list`);

    core.endGroup();
    return commits;
}

const parseGitTag = (inputRef: string): string => {
    const re = /^(refs\/)?tags\/(.*)$/;
    const resMatch = inputRef.match(re);
    if (!resMatch || !resMatch[2]) {
        core.debug(`Input "${inputRef}" does not appear to be a tag`);
        return "";
    }
    return resMatch[2];
};

main();