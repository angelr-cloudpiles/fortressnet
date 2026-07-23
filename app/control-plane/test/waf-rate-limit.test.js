import assert from "node:assert/strict";
import test from "node:test";
import { compileWafRules, normalizeWafRateLimitConfig, toAwsWafRules } from "../server.js";

test("compiles a rate limit scoped to path, methods, and countries", () => {
  const policy = {
    mode: "block",
    rate_limit: 600,
    rate_limit_path: "/login",
    rate_limit_methods: ["POST", "PUT"],
    rate_limit_countries: ["AR", "ES"]
  };
  const rateRule = compileWafRules(policy).find((rule) => rule.type === "rate_based_rule");
  const awsRule = toAwsWafRules([rateRule], "dom_test")[0];
  const rateStatement = awsRule.Statement.RateBasedStatement;

  assert.equal(awsRule.Action.Block !== undefined, true);
  assert.equal(rateStatement.AggregateKeyType, "IP");
  assert.equal(rateStatement.Limit, 600);
  assert.equal(rateStatement.EvaluationWindowSec, 300);
  assert.equal(rateStatement.ScopeDownStatement.AndStatement.Statements.length, 3);

  const [pathStatement, methodStatement, countryStatement] = rateStatement.ScopeDownStatement.AndStatement.Statements;
  assert.equal(pathStatement.ByteMatchStatement.SearchString.toString(), "/login");
  assert.equal(pathStatement.ByteMatchStatement.FieldToMatch.UriPath !== undefined, true);
  assert.equal(methodStatement.OrStatement.Statements.length, 2);
  assert.equal(methodStatement.OrStatement.Statements[0].ByteMatchStatement.SearchString.toString(), "POST");
  assert.deepEqual(countryStatement.GeoMatchStatement.CountryCodes, ["AR", "ES"]);
});

test("keeps the global rate limit unscoped when no conditions are selected", () => {
  const rateRule = compileWafRules({ mode: "monitor", rate_limit: 2000 }).find((rule) => rule.type === "rate_based_rule");
  const awsRule = toAwsWafRules([rateRule], "dom_test")[0];

  assert.equal(awsRule.Action.Count !== undefined, true);
  assert.equal(awsRule.Statement.RateBasedStatement.ScopeDownStatement, undefined);
});

test("rejects unsafe rate limit configuration", () => {
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 99 }), { message: "rate_limit_invalid" });
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 200, rate_limit_path: "login" }), { message: "rate_limit_path_invalid" });
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 200, rate_limit_methods: ["TRACE"] }), { message: "rate_limit_methods_invalid" });
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 200, rate_limit_countries: ["ZZ"] }), { message: "rate_limit_countries_invalid" });
});
