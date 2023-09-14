import * as core from "@actions/core";
import { Endpoints } from "@octokit/types";
import { Commit } from "conventional-commits-parser";
import defaultChangelogOpt from "conventional-recommended-bump";

type ReposCompareCommitsResponseCommitsItem =
  Endpoints["GET /repos/{owner}/{repo}/compare/{base}...{head}"]["response"]["data"]["commits"][0];

export const getShortSHA = (sha: string): string => {
  const coreAbbrev = 7;
  return sha.substring(0, coreAbbrev);
};

export type ParsedCommitsExtraCommit =
  ReposCompareCommitsResponseCommitsItem & {
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

type ParsedCommitsExtra = {
  commit: ParsedCommitsExtraCommit;
  pullRequests: {
    number: number;
    url: string;
  }[];
  breakingChange: boolean;
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

export type ParsedCommits = {
  type: ConventionalCommitTypes;
  scope: string;
  subject: string;
  merge: string;
  header: string;
  body: string;
  footer: string;
  notes: {
    title: string;
    text: string;
  }[];
  extra: ParsedCommitsExtra;
  references: {
    action: string;
    owner: string;
    repository: string;
    issue: string;
    raw: string;
    prefix: string;
  }[];
  mentions: string[];
  revert: boolean;
};

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

const getFormattedChangelogEntry = (parsedCommit: ParsedCommits): string => {
  let entry = "";

  const url = parsedCommit.extra.commit.html_url;
  const sha = getShortSHA(parsedCommit.extra.commit.sha);
  const author = parsedCommit?.extra?.commit?.commit?.author?.name;

  let prString = "";
  prString = parsedCommit.extra.pullRequests.reduce((acc, pr) => {
    // e.g. #1
    // e.g. #1,#2
    // e.g. ''
    if (acc) {
      acc += ",";
    }
    return `${acc}[#${pr.number}](${pr.url})`;
  }, "");
  if (prString) {
    prString = " " + prString;
  }

  entry = `- ${sha}: ${parsedCommit.header} (${author})${prString}`;
  if (parsedCommit.type) {
    const scopeStr = parsedCommit.scope ? `**${parsedCommit.scope}**: ` : "";
    entry = `- ${scopeStr}${parsedCommit.subject}${prString} ([${author}](${url}))`;
  }

  return entry;
};

export const generateChangelogFromParsedCommits = (
  parsedCommits: Commit[],
): string => {
  let changelog = "";

  for (const key of Object.keys(ConventionalCommitTypes)) {
    const clBlock = parsedCommits
      .filter((val) => val.type === key)
      .reduce((acc, line) => `${acc}\n${line}`, "");
    if (clBlock) {
      changelog += `\n\n## ${(ConventionalCommitTypes as any)[key]}\n`;
      changelog += clBlock.trim();
    }
  }

  // Commits
  const commits = parsedCommits.reduce((acc, line) => `${acc}\n${line}`, "");
  if (commits) {
    changelog += "\n\n## Commits\n";
    changelog += commits.trim();
  }

  return changelog.trim();
};
