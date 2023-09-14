import conventionalCommitsParser from "conventional-commits-parser";
import {
    ConventionalChangelogCommit,
    Message,
    parser,
    toConventionalChangelogFormat
} from "@conventional-commits/parser";

function testTest() {
    const transform = conventionalCommitsParser.sync("just fixing some stuff", {
        mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    })

    console.log(transform)
}

function testTest2() {
    const result = parser("just fixing some stuff");

    console.log(result)
}

testTest()
testTest2()