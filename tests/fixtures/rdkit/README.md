# Test files from RDKit

Files other programs wrote (ChemDraw's CDXML and CDX, Marvin's and others' RXN), from RDKit's own
tests, unchanged: `CDXML/` from `Code/GraphMol/test_data/CDXML` (and `Issue3514824.cdxml` from
`Code/GraphMol/FileParsers/test_data`), `ChemReactions/` from `Code/GraphMol/ChemReactions/testData`,
of RDKit at commit 24b68ec319e906708595ee069fedd897631fae19 (10 November 2026),
https://github.com/rdkit/rdkit. Copyright the RDKit authors, BSD 3-Clause License (LICENSE.txt).

olomol's browser check opens every one of them as a user would (scripts/check/11-other-programs.mjs)
and compares what it reads with `expected.json`: the molecules RDKit's own tests expect from the
file (Code/GraphMol/FileParsers/cdxml_parser_catch.cpp) where they say, and where olomol reads
differently, what it reads and why. Files that are broken on purpose must give an error message.
