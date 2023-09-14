import * as core from "@actions/core";
import { RestEndpointMethodTypes } from "@octokit/rest";
import { Endpoints } from "@octokit/types";
import { Commit } from "conventional-commits-parser";
import defaultChangelogOpt from "conventional-recommended-bump";
import { ParsedCommit } from ".";

type ReposCompareCommitsResponseCommitsItem =
  Endpoints["GET /repos/{owner}/{repo}/compare/{base}...{head}"]["response"]["data"]["commits"][0];

export const getShortSHA = (sha: string): string => {
  const coreAbbrev = 7;
  return sha.substring(0, coreAbbrev);
};

type BaseheadCommits =
  RestEndpointMethodTypes["repos"]["compareCommitsWithBasehead"]["response"];

export type ParsedCommitsExtraCommit = {
  author: {
    email: string;
    name: string;
    username: string;
  };
  committer: {
    email: string;
    name: string;
    username: string;
  };
  distinct: boolean;
  id: string;
  message: string;
  timestamp: string;
  tree_id: string;
  url: string;
};

enum ConventionalCommitTypes {
  feat = "Features",
  fix = "Bug Fixes",
  docs = "Documentation",
  style = "Styles",
  refactor = "Code Refactoring",
  perf = "Performance Improvements",
  test = "Tests",
  build = "Builds",
  ci = "Continuous Integration",
  chore = "Chores",
  revert = "Reverts",
}

export const getChangelogOptions = async (): Promise<any> => {
  const defaultOpts = defaultChangelogOpt(
    {},
    {
      mergePattern: /^Merge pull request #(.*) from (.*)$/,
      mergeCorrespondence: ["issueId", "source"],
    },
    () => {},
  );

  core.debug(`Changelog options: ${JSON.stringify(defaultOpts)}`);
  return defaultOpts;
};

export const isBreakingChange = ({
  body,
  footer,
}: {
  body: string;
  footer: string;
}): boolean => {
  const re = /^BREAKING\s+CHANGES?:\s+/;
  return re.test(body || "") || re.test(footer || "");
};

export const generateChangelogFromParsedCommits = (
    parsedCommits: ParsedCommit[]
): string => {
    const changelog: { [key: string]: string[] } = {};

    parsedCommits.forEach((parsedCommit) => {
        const { commitMsg, commit } = parsedCommit;
        const { header, body, footer } = commitMsg;

        const shortSHA = getShortSHA(commit.sha);

        // Convert commit message parts to strings and append to changelog
        const commitMsgLines = [
            `* ${header} ([${shortSHA}](${commit.html_url}))`,
            body ? `  ${body}` : '',  // Ensure body is a string
            footer ? `  ${footer}` : '',  // Ensure footer is a string
        ].filter(Boolean).join('\n');

        const type = header ? header.split(":")[0] : "chore";
        const typeTitle = (ConventionalCommitTypes as any)[type];

        if (!typeTitle) {
            core.warning(`Unknown commit type: ${type}`);
            return;
        }

        if (!changelog[typeTitle]) {
            changelog[typeTitle] = [];
        }

        changelog[typeTitle].push(commitMsgLines);
    });

    // Convert the changelog object to a formatted string
    const changelogString = Object.keys(changelog)
        .map((type) => {
            const commitsOfType = changelog[type];
            if (commitsOfType.length) {
                return `### ${type}\n\n${commitsOfType.join("\n")}`;
            }
            return '';
        })
        .filter(Boolean)
        .join('\n\n');

    return changelogString;
};
