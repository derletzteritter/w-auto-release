import conventionalCommitsParser from "conventional-commits-parser";

function testTest() {
  const transform = conventionalCommitsParser.sync("just fixing some stuff", {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
  });

  console.log(transform);
}

testTest();
