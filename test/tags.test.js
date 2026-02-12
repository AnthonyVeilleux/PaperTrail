// test/tags.test.js
import assert from "assert";
import { extractHashtags } from "../src/tags.js";

describe("extractHashtags",() => {
  it("counts occurrences", ()=> {
    const res= extractHashtags("#A #A #B");
    assert.deepStrictEqual(res.tags,{ A: 2, B: 1 });
  });

  it("builds hierarchy for dotted tags",() =>{
    const res =extractHashtags("#Parent.Child #Parent.Child.Grandchild");
    assert.ok(res.hierarchy.Parent.includes("Parent.Child"));
    assert.ok(res.hierarchy["Parent.Child"].includes("Parent.Child.Grandchild"));
  });
});

