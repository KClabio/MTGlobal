// check() records one result. Only failures are printed (all results with `npm test -- --verbose`).
// tests/run.mjs reads the final "@@RESULT <passed> <failed>" line.
let passed = 0;
let failed = 0;
const verbose = process.env.TEST_VERBOSE === '1';

export function check(label, ok, detail) {
  if (ok) {
    passed++;
    if (verbose) console.log(`PASS  ${label}`);
  } else {
    failed++;
    const more = detail === undefined ? '' : ' -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600);
    console.log(`FAIL  ${label}${more}`);
  }
  return !!ok;
}

export function result() {
  console.log(`@@RESULT ${passed} ${failed}`);
  return failed;
}
