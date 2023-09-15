"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var conventional_commits_parser_1 = require("conventional-commits-parser");
function testTest() {
    var transform = conventional_commits_parser_1.default.sync("just fixing some stuff", {
        mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    });
    console.log(transform);
}
testTest();
