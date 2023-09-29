import conventionalCommitsParser from "conventional-commits-parser";
import { ReleaseType, prerelease } from "semver";
import inc from "semver/functions/inc";
import recommendedBump from "recommended-bump";
import { warning } from "@actions/core";

async function testBump(isPreRelease = false) {
  const currentTag = "1.0.3-beta.0";

  const customCommits = ["fix: bug fix for issue #123", "fix: new feature"];

  let { increment, patch, isBreaking } = recommendedBump(customCommits);

  console.log("Orginal", increment, patch, isBreaking);

  if (isPreRelease) {
    const preinc = ("pre" + increment) as ReleaseType;
    const preTag = inc(currentTag, preinc, "beta");

    console.log("Preinc", preTag);
    return;
  }

  const result = inc(currentTag, increment, "beta");

  console.log("New tag", result);
}

testBump();
