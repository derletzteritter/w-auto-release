import {Octokit} from "@octokit/rest";
import * as core from "@actions/core";
import {Context} from "@actions/github/lib/context";
import semverValid from "semver/functions/valid";
import semverRcompare from "semver/functions/rcompare";
import semverInc from "semver/functions/inc";
import {
    ActionArgs,
    BaseheadCommits,
    GitGetRefParams,
    OctokitClient,
    ParsedCommit,
    ReposListTagsParams,
} from "./typings";
import {prerelease, ReleaseType} from "semver";
import conventionalCommitsParser, {Commit} from "conventional-commits-parser";
import {getNextSemverBump} from "./utils";

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

        const parsedCommits = await parseCommits(octokit, context.repo.owner, context.repo.repo, commitsSinceRelease);

        core.info(`Found ${commitsSinceRelease.length} commits since last release`);
        core.info(JSON.stringify(commits));

        core.info("PARSED COMMITS: " + JSON.stringify(parsedCommits));

        const newReleaseTag = await createNewReleaseTag(previousReleaseTag, parsedCommits, args.environment);

        core.info(`New release tag DEBUGDEBUG: ${newReleaseTag}`);
    } catch (err) {
        if (err instanceof Error) {
            core.setFailed(err?.message);
            throw err;
        }

        core.setFailed("An unexpected error occurred");
        throw err;
    }
}

const createNewReleaseTag = async (currentTag: string, commits: ParsedCommit[], environment: "dev" | "test" | "prod") => {
    let increment = getNextSemverBump(commits);

    core.info(`Next semver bump: ${increment}`)

    if (environment === 'test') {
        const preinc = "pre" + increment as ReleaseType;
        const preTag = semverInc(currentTag, preinc, "beta");

        core.info(`New pre-release tag: ${preTag}`);
        return preTag;
    }

    return semverInc(currentTag, increment);
}

async function searchForPreviousReleaseTag(
    octokit: OctokitClient,
    tagInfo: ReposListTagsParams,
    environment: "dev" | "test" | "prod",
) {
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

async function parseCommits(
    octokit: OctokitClient,
    owner: string,
    repo: string,
    commits: BaseheadCommits["data"]["commits"],
) {
    const parsedCommits: ParsedCommit[] = [];

    for (const commit of commits) {
        core.info(`Processing commit ${commit.sha}`);

        const pulls = await octokit.repos.listPullRequestsAssociatedWithCommit({
            owner,
            repo,
            commit_sha: commit.sha,
        });

        if (pulls.data.length) {
            core.info(
                `Found ${pulls.data.length} pull request(s) associated with commit ${commit.sha}`,
            );
        }

        const changelogCommit = conventionalCommitsParser.sync(
            commit.commit.message,
            {
                mergePattern: /^Merge pull request #(\d+) from (.*)$/,
                revertPattern: /^Revert \"([\s\S]*)\"$/,
            },
        );

        if (changelogCommit.merge) {
            core.debug(`Ignoring merge commit: ${changelogCommit.merge}`);
            continue;
        }

        if (changelogCommit.revert) {
            core.debug(`Ignoring revert commit: ${changelogCommit.revert}`);
            continue;
        }

        const parsedCommit: ParsedCommit = {
            commitMsg: changelogCommit,
            commit,
        };

        parsedCommits.push(parsedCommit);
    }

    return parsedCommits;
}

main();