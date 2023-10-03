import conventionalCommitsParser from "conventional-commits-parser";
import {ReleaseType, prerelease} from "semver";
import inc from "semver/functions/inc";
import recommendedBump from "recommended-bump";
import {warning} from "@actions/core";
import conventionalRecommendedBump from "conventional-recommended-bump";
import * as core from "@actions/core";
import semverValid from "semver/functions/valid";
import semverRcompare from "semver/functions/rcompare";

const tl = [{
    "name": "v1.3",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/v1.3",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/v1.3",
    "commit": {
        "sha": "f9cc77393801e5f24d3d3949df0ca437d8905004",
        "url": "https://api.github.com/repos/itschip/algo/commits/f9cc77393801e5f24d3d3949df0ca437d8905004"
    },
    "node_id": "REF_kwDOHQbLkK5yZWZzL3RhZ3MvdjEuMw"
}, {
    "name": "pre-1.0.0",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/pre-1.0.0",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/pre-1.0.0",
    "commit": {
        "sha": "70ad47e8e52dd8684e807b5ed96dbe38817b0a45",
        "url": "https://api.github.com/repos/itschip/algo/commits/70ad47e8e52dd8684e807b5ed96dbe38817b0a45"
    },
    "node_id": "REF_kwDOHQbLkLNyZWZzL3RhZ3MvcHJlLTEuMC4w"
}, {
    "name": "latest",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/latest",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/latest",
    "commit": {
        "sha": "04d69c76202174e46defb892381b917caa2e7c60",
        "url": "https://api.github.com/repos/itschip/algo/commits/04d69c76202174e46defb892381b917caa2e7c60"
    },
    "node_id": "REF_kwDOHQbLkLByZWZzL3RhZ3MvbGF0ZXN0"
}, {
    "name": "1.0.2-pre",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/1.0.2-pre",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/1.0.2-pre",
    "commit": {
        "sha": "1691c52fb0c0061336d5d7c65d268c415dfcf685",
        "url": "https://api.github.com/repos/itschip/algo/commits/1691c52fb0c0061336d5d7c65d268c415dfcf685"
    },
    "node_id": "REF_kwDOHQbLkLNyZWZzL3RhZ3MvMS4wLjItcHJl"
}, {
    "name": "1.0.1-pre",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/1.0.1-pre",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/1.0.1-pre",
    "commit": {
        "sha": "a4a6ff96476aa35418a3bbb9c2a401737fa345d5",
        "url": "https://api.github.com/repos/itschip/algo/commits/a4a6ff96476aa35418a3bbb9c2a401737fa345d5"
    },
    "node_id": "REF_kwDOHQbLkLNyZWZzL3RhZ3MvMS4wLjEtcHJl"
}, {
    "name": "1.0.0-pre",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/1.0.0-pre",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/1.0.0-pre",
    "commit": {
        "sha": "04d69c76202174e46defb892381b917caa2e7c60",
        "url": "https://api.github.com/repos/itschip/algo/commits/04d69c76202174e46defb892381b917caa2e7c60"
    },
    "node_id": "REF_kwDOHQbLkLNyZWZzL3RhZ3MvMS4wLjAtcHJl"
}, {
    "name": "0.0.1",
    "zipball_url": "https://api.github.com/repos/itschip/algo/zipball/refs/tags/0.0.1",
    "tarball_url": "https://api.github.com/repos/itschip/algo/tarball/refs/tags/0.0.1",
    "commit": {
        "sha": "04d69c76202174e46defb892381b917caa2e7c60",
        "url": "https://api.github.com/repos/itschip/algo/commits/04d69c76202174e46defb892381b917caa2e7c60"
    },
    "node_id": "REF_kwDOHQbLkK9yZWZzL3RhZ3MvMC4wLjE"
}]

function createNewReleaseTag(environment) {
    const tagList = tl
        .map((tag: any) => {
            core.info(`Found tag ${tag.name}`);
            if (environment === 'test') {
                core.info(`Environment is test, checking for prerelease tag`)
                const preArr = prerelease(tag.name);
                if (preArr?.length > 0 && preArr?.includes("pre")) {
                    const t = semverValid(tag.name);
                    core.info(`Prerelease tag: ${t}`)
                    return {
                        ...tag,
                        semverTag: t ?? null
                    }
                }

                return {
                    ...tag,
                    semverTag: null
                }
            } else {
                core.info(`Environment is not test, checking for semver tag`)
                const t = semverValid(tag.name);
                core.info(`Semver tag: ${t}`)
                const preArr = prerelease(tag.name);
                if (preArr?.length > 0 && preArr?.includes("pre")) {
                    return {
                        ...tag,
                        semverTag: null
                    }
                }
                return {
                    ...tag,
                    semverTag: t,
                };
            }
        })
        .filter((tag) => tag?.semverTag !== null)
        .sort((a, b) => semverRcompare(a.semverTag, b.semverTag));


    console.log(tagList);
}

async function testRecommendedBump() {
    const currentTag = "1.0.2-pre"

    const newStableVersion = inc(currentTag, "minor", {
        loose: false
    })

    console.log(newStableVersion)
}

createNewReleaseTag("prod");