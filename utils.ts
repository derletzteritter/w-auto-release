import * as core from "@actions/core";
import { RestEndpointMethodTypes } from "@octokit/rest";
import { Endpoints } from "@octokit/types";
import { Commit } from "conventional-commits-parser";
import defaultChangelogOpt from "conventional-recommended-bump";
import { ParsedCommit } from ".";

export const getShortSHA = (sha: string): string => {
  const coreAbbrev = 7;
  return sha.substring(0, coreAbbrev);
};

export const generateChangelogFromParsedCommits = (
    parsedCommits: ParsedCommit[]
): string => {
    const changelog = ""

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


        changelog.concat(commitMsgLines);
    });

    return changelog;
};
