import conventionalCommitsParser from "conventional-commits-parser";
import {ReleaseType, prerelease} from "semver";
import inc from "semver/functions/inc";
import recommendedBump from "recommended-bump";
import {warning} from "@actions/core";
import conventionalRecommendedBump from "conventional-recommended-bump";

async function testRecommendedBump() {
    const customCommits = ["fix: bug fix for issue #123", "feat: new feature"]


    // @ts-ignore
    const result = await conventionalRecommendedBump({
        preset: "angular",
        commits: customCommits,
        tagPrefix: "v",
    });

    console.log(result);
}

testRecommendedBump();
