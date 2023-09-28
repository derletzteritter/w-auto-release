import conventionalCommitsParser from "conventional-commits-parser";
import conventionalRecommendedBump from "conventional-recommended-bump";

function testTest() {
  const transform = conventionalCommitsParser.sync("just fixing some stuff", {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
  });

  console.log(transform);
}

async function testBump() {
  const customCommits = [{ header: "fix: bug fix for issue #123" }];

  const bump = await conventionalRecommendedBump({
    preset: "angular",
    tagPrefix: "v",
    commits: customCommits,
  });

  console.log(bump);
}

testBump();
