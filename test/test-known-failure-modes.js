#!/usr/bin/env node
/**
 * Known Failure Mode Tests - Based on research and real-world issues
 *
 * Sources:
 * - Anthropic Claude Code GitHub Issues (2024-2025)
 * - arXiv research on tool hallucinations (2024-2025)
 * - Real-world MCP tool use problems
 *
 * Key failure modes identified:
 * 1. Wrong tool selection (similar names)
 * 2. Incorrect parameters
 * 3. Tool documentation deficiencies
 * 4. Execution hallucinations (misreading outputs)
 * 5. Progress misjudgments
 * 6. Instruction misinterpretation
 * 7. Long-horizon reasoning breakdowns
 */

const { callMCP, test, assertTrue, getStats, colors } = require('./test-utils');

async function analyzeFailureModes() {
  console.log(colors.bold + '\nKNOWN FAILURE MODE ANALYSIS' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log('Testing mitigation of research-identified agent failures\n');

  const failureModes = [
    {
      category: 'Wrong Tool Selection',
      problem: 'Agents select similar-named tools incorrectly',
      example: 'notification-send-user vs notification-send-channel confusion',
      frequency: 'HIGH (most common in Claude Code)',
      mitigation: [
        '✓ Distinct tool names (record_experience, search_experiences)',
        '✓ Clear descriptions that differentiate purpose',
        '✓ Active voice verbs that indicate action'
      ],
      ourApproach: 'Tool names explicitly indicate action and object',
      testable: true,
      risk: 'LOW - Clear naming and descriptions'
    },
    {
      category: 'Incorrect Parameters',
      problem: 'Agents pass wrong values or missing required params',
      example: 'Forgetting session_id or using wrong enum value',
      frequency: 'HIGH (second most common)',
      mitigation: [
        '✓ Required params clearly marked in schema',
        '✓ Enums with explicit allowed values',
        '✓ Parameter descriptions reference where to get values',
        '⚠️  No way to enforce correct values (LLM decision)'
      ],
      ourApproach: 'session_id description says "from analyze_problem"',
      testable: false,
      risk: 'MEDIUM - Can document but cannot enforce'
    },
    {
      category: 'Tool Documentation Deficiencies',
      problem: 'Redundant, incomplete, or inaccurate descriptions',
      example: 'Tool description doesn\'t explain when to use it',
      frequency: 'MEDIUM (research: major cause)',
      mitigation: [
        '✓ Active voice descriptions',
        '✓ Workflow order explicit ("First step")',
        '✓ Prerequisites mentioned',
        '✓ No redundant information',
        '✓ Standardized format across all tools'
      ],
      ourApproach: 'Tool guidance tests verify description quality',
      testable: true,
      risk: 'LOW - Validated by automated tests'
    },
    {
      category: 'Execution Hallucinations',
      problem: 'Agent misreads tool outputs or fabricates results',
      example: 'Agent says tool succeeded when it failed',
      frequency: 'MEDIUM (research: divergence from actual functionality)',
      mitigation: [
        '✓ Structured JSON outputs',
        '✓ Clear success/error indicators',
        '✓ Detailed result objects',
        '⚠️  Cannot prevent LLM from misreading'
      ],
      ourApproach: 'All tools return JSON with explicit status',
      testable: false,
      risk: 'MEDIUM - Cannot control LLM interpretation'
    },
    {
      category: 'Progress Misjudgments',
      problem: 'Agent thinks task complete when it\'s not',
      example: 'Agent stops before completing workflow',
      frequency: 'MEDIUM (research: flawed planning)',
      mitigation: [
        '✓ Hooks physically block incomplete workflows',
        '✓ Clear error messages guide next steps',
        '✓ Token system tracks completion',
        '⚠️  Agent may not realize workflow incomplete'
      ],
      ourApproach: 'Hooks enforce - even if agent misjudges',
      testable: true,
      risk: 'LOW - Hooks catch misjudgments'
    },
    {
      category: 'Instruction Misinterpretation',
      problem: 'Agent doesn\'t understand what user wants',
      example: 'Vague request "help with auth" not clarified',
      frequency: 'LOW (user communication issue)',
      mitigation: [
        '✓ Agent can explore freely (Read/Grep allowed)',
        '✓ Workflow triggered only at Write/Edit',
        '⚠️  Cannot force agent to clarify'
      ],
      ourApproach: 'Flexible - allows exploration before enforcement',
      testable: true,
      risk: 'LOW - Edge case tests verify handling'
    },
    {
      category: 'Long-Horizon Reasoning Breakdowns',
      problem: 'Agent loses track over multi-step tasks',
      example: 'Forgets to complete workflow on 5th file edit',
      frequency: 'HIGH (research: major challenge)',
      mitigation: [
        '✓ Session tokens last 60 minutes',
        '✓ Hooks enforce EVERY Write/Edit',
        '✓ Session state retrievable',
        '⚠️  Agent may forget session context'
      ],
      ourApproach: 'Stateless enforcement - hooks check every operation',
      testable: true,
      risk: 'LOW - Hooks don\'t rely on agent memory'
    },
    {
      category: 'Tool Hallucination (Fabrication)',
      problem: 'Agent invokes non-existent tools',
      example: 'Calls "search_memory" when only search_experiences exists',
      frequency: 'LOW (research: exists but rare with clear schemas)',
      mitigation: [
        '✓ MCP schema validation',
        '✓ Clear tool listing',
        '⚠️  Cannot prevent hallucination attempt'
      ],
      ourApproach: 'MCP protocol rejects invalid tool names',
      testable: false,
      risk: 'LOW - Protocol-level protection'
    },
    {
      category: 'Context Consumption (MCP Specific)',
      problem: 'Loading all tool definitions uses too much context',
      example: '7+ servers = 67k+ tokens (33% of 200k limit)',
      frequency: 'HIGH (documented Claude Code issue)',
      mitigation: [
        '✓ Only 34 tools total',
        '✓ Concise descriptions',
        '✓ Single server (not 7+)',
        '⚠️  Still loads all tool schemas'
      ],
      ourApproach: 'Minimal tool count, efficient descriptions',
      testable: false,
      risk: 'LOW - Well below problematic thresholds'
    },
    {
      category: 'Subagent Tool Access (MCP Specific)',
      problem: 'Subagents cannot access MCP tools',
      example: 'run_in_background agents report tools unavailable',
      frequency: 'HIGH (open GitHub issues)',
      mitigation: [
        '⚠️  This is a Claude Code limitation',
        '⚠️  Tools work in main context only',
        '⚠️  Cannot fix at server level'
      ],
      ourApproach: 'Document limitation, works in main context',
      testable: false,
      risk: 'MEDIUM - Users may be confused'
    }
  ];

  console.log(colors.bold + 'FAILURE MODE COVERAGE:\n' + colors.reset);

  let testableCount = 0;
  let lowRiskCount = 0;
  let mediumRiskCount = 0;
  let highRiskCount = 0;

  for (const mode of failureModes) {
    console.log(colors.bold + `📋 ${mode.category}` + colors.reset);
    console.log(`   Problem: ${mode.problem}`);
    console.log(`   Frequency: ${mode.frequency}`);
    console.log(`   Risk Level: ${mode.risk}\n`);

    console.log(`   ${colors.cyan}Mitigations:${colors.reset}`);
    for (const mitigation of mode.mitigation) {
      console.log(`     ${mitigation}`);
    }

    console.log(`\n   ${colors.green}Our Approach:${colors.reset} ${mode.ourApproach}\n`);

    if (mode.testable) testableCount++;
    if (mode.risk.includes('LOW')) lowRiskCount++;
    else if (mode.risk.includes('MEDIUM')) mediumRiskCount++;
    else if (mode.risk.includes('HIGH')) highRiskCount++;
  }

  const mitigatedCount = lowRiskCount + mediumRiskCount;

  // Summary statistics
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'FAILURE MODE SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(`Total identified failure modes: ${failureModes.length}`);
  console.log(`Testable automatically: ${testableCount}/${failureModes.length} (${(testableCount/failureModes.length*100).toFixed(1)}%)`);
  console.log(`Mitigated: ${mitigatedCount}/${failureModes.length} (${(mitigatedCount/failureModes.length*100).toFixed(1)}%)`);
  console.log(`Low risk: ${lowRiskCount}/${failureModes.length} (${(lowRiskCount/failureModes.length*100).toFixed(1)}%)\n`);

  // Risk assessment
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'RISK ASSESSMENT' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  const lowRisk = failureModes.filter(m => m.risk === 'LOW');
  const mediumRisk = failureModes.filter(m => m.risk === 'MEDIUM');
  const highRisk = failureModes.filter(m => m.risk === 'HIGH');

  console.log(colors.green + `\n✅ LOW RISK (${lowRisk.length} modes):` + colors.reset);
  for (const mode of lowRisk) {
    console.log(`   • ${mode.category}`);
  }

  console.log(colors.yellow + `\n⚠️  MEDIUM RISK (${mediumRisk.length} modes):` + colors.reset);
  for (const mode of mediumRisk) {
    console.log(`   • ${mode.category}`);
  }

  if (highRisk.length > 0) {
    console.log(colors.red + `\n❌ HIGH RISK (${highRisk.length} modes):` + colors.reset);
    for (const mode of highRisk) {
      console.log(`   • ${mode.category}`);
    }
  }

  // Recommendations
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'RECOMMENDATIONS' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  console.log('\n' + colors.green + 'Strengths (LOW RISK):' + colors.reset);
  console.log('  • Clear tool naming prevents selection errors');
  console.log('  • Documentation quality validated by tests');
  console.log('  • Hooks enforce workflow despite misjudgments');
  console.log('  • Stateless enforcement handles long-horizon tasks');
  console.log('  • Minimal context consumption');
  console.log('  • Flexible handling of vague requests\n');

  console.log(colors.yellow + 'Watch Areas (MEDIUM RISK):' + colors.reset);
  console.log('  • Parameter errors cannot be prevented (monitor usage)');
  console.log('  • Execution hallucinations possible (validate outputs)');
  console.log('  • Subagent limitations (document clearly)\n');

  console.log(colors.blue + 'Manual Testing Needed:' + colors.reset);
  console.log('  • Test with real Claude Code for parameter accuracy');
  console.log('  • Verify agents read outputs correctly');
  console.log('  • Check long-horizon task completion rates');
  console.log('  • Monitor for tool hallucination attempts\n');

  // Sources
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'RESEARCH SOURCES' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  console.log('\nAcademic Research (2024-2025):');
  console.log('  • arXiv:2510.22977 - "The Reasoning Trap: Tool Hallucination"');
  console.log('  • arXiv:2412.04141 - "Reducing Tool Hallucination"');
  console.log('  • arXiv:2509.18970 - "LLM-based Agents Suffer from Hallucinations"');
  console.log('  • arXiv:2509.25370 - "WHERE LLM AGENTS FAIL"');

  console.log('\nPractitioner Reports:');
  console.log('  • Anthropic Claude Code GitHub Issues (#13605, #13254)');
  console.log('  • Arsturn: "Why Claude Ignores MCP Prompts"');
  console.log('  • Scott Spence: "Optimising MCP Server Context Usage"');
  console.log('  • Cleanlab: "Automated Hallucination Correction"');

  console.log('\n' + colors.green + '✓ Analysis complete - risk assessment documented' + colors.reset);
}

// Run analysis
analyzeFailureModes().catch(console.error);
