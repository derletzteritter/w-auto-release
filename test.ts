import conventionalCommitsParser from "conventional-commits-parser";
import {ReleaseType, prerelease} from "semver";
import inc from "semver/functions/inc";
import recommendedBump from "recommended-bump";
import {warning} from "@actions/core";
import conventionalRecommendedBump from "conventional-recommended-bump";

async function testRecommendedBump() {
    const currentTag = "1.0.2-pre"

    const newStableVersion = inc(currentTag, "minor", {
        loose: false
    })

    console.log(newStableVersion)
}

testRecommendedBump();