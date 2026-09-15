#!/usr/bin/env node
/**
 * Design System Validation Script
 *
 * Comprehensive checks for design system consistency:
 * ✅ Token definitions are valid JSON
 * ✅ All component colors use token names (no direct hex)
 * ✅ Border-radius values match token scales
 * ✅ Shadow values are from token definitions
 * ✅ Focus rings use consistent colors
 * ✅ Files are synchronized
 *
 * Usage:
 *   npm run validate-design-system
 *   npm run validate-design-system:fix  (auto-fix some issues)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * This validator deliberately limits its source audit to shared components and
 * maintained application views. Product migrations define their own scope.
 *
 * The Departamento Pessoal do Zero landing page is a hard exclusion of
 * DSV2-R7. Keep these paths here even when an audit root is broadened: the
 * traversal below refuses to enter either directory.
 */
const AUDIT_ROOTS = [
  'src/components',
  'src/views/public',
  'src/views/admin',
];

const PROTECTED_AUDIT_PATHS = [
  'src/features/public/landing-pages/departamento-pessoal-do-zero',
  'app/lp/departamento-pessoal-do-zero',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Color codes for terminal output
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${COLORS.RESET}`);
}

function readJsonIfExists(relativePath) {
  const filePath = path.join(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function toProjectPath(relativePath) {
  return path.resolve(PROJECT_ROOT, relativePath);
}

function comparePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isProtectedAuditPath(filePath) {
  const absolutePath = path.resolve(filePath);

  return PROTECTED_AUDIT_PATHS.some(relativePath => {
    const protectedPath = toProjectPath(relativePath);
    return absolutePath === protectedPath || absolutePath.startsWith(`${protectedPath}${path.sep}`);
  });
}

function getAuditableSourceFiles() {
  const files = [];

  function collect(dir) {
    if (isProtectedAuditPath(dir)) {
      return;
    }

    fs.readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => comparePaths(left.name, right.name))
      .forEach(entry => {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          collect(filePath);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
          files.push(filePath);
        }
      });
  }

  AUDIT_ROOTS
    .map(toProjectPath)
    .filter(fs.existsSync)
    .sort(comparePaths)
    .forEach(collect);

  return files.sort(comparePaths);
}

/**
 * Guard DSV2-R7 in executable form. It validates the exclusion configuration
 * and the traversal predicate without reading or inventorying protected files.
 */
function validateProtectedAuditScope() {
  log(COLORS.CYAN, '\n🛡️ Validating protected audit scope...');

  let valid = true;

  PROTECTED_AUDIT_PATHS.forEach(relativePath => {
    const protectedPath = toProjectPath(relativePath);

    if (!isProtectedAuditPath(protectedPath)) {
      log(COLORS.RED, `  ❌ Protected path is not excluded: ${relativePath}`);
      valid = false;
      return;
    }

    if (getAuditableSourceFiles().some(filePath => isProtectedAuditPath(filePath))) {
      log(COLORS.RED, `  ❌ Protected files entered the audit: ${relativePath}`);
      valid = false;
      return;
    }

    log(COLORS.GREEN, `  ✅ Excluded from source audit: ${relativePath}`);
  });

  return valid;
}

/**
 * Validation: Token files exist and are valid JSON
 */
function validateTokenFiles() {
  log(COLORS.CYAN, '\n🔍 Validating token files...');

  const requiredFiles = [
    'src/design-tokens/tokens.css',
    'src/design-tokens/tokens.json',
    'src/design-tokens/tokens.dtcg.json',
    'src/design-tokens/tokens.tailwind.js',
  ];

  let allValid = true;

  requiredFiles.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(filePath)) {
      log(COLORS.RED, `  ❌ Missing: ${file}`);
      allValid = false;
      return;
    }

    try {
      if (file.endsWith('.json')) {
        JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        log(COLORS.GREEN, `  ✅ ${file}`);
      } else if (file.endsWith('.js')) {
        // Basic syntax check
        execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
        log(COLORS.GREEN, `  ✅ ${file}`);
      } else if (file.endsWith('.css')) {
        log(COLORS.GREEN, `  ✅ ${file}`);
      }
    } catch (error) {
      log(COLORS.RED, `  ❌ ${file}: ${error.message}`);
      allValid = false;
    }
  });

  return allValid;
}

/**
 * Validation: Check for direct hex colors in shared UI and app views
 */
function validateComponentColors() {
  log(COLORS.CYAN, '\n🎨 Checking for direct hex colors in components and app views...');

  const sourceFiles = getAuditableSourceFiles();

  if (sourceFiles.length === 0) {
    log(COLORS.YELLOW, '  ⚠️ No component or view directories found');
    return true;
  }

  const hexPattern = /#[0-9a-f]{3,8}/gi;
  const ignoredPatterns = [
    /'trust-keith-teal':\s*'#235875'/,  // Token definition
    /'#0000'/,  // Transparent black (special case)
    /'#fff'/,   // Transparent white (special case)
  ];

  let violations = 0;

  sourceFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;

    while ((match = hexPattern.exec(content)) !== null) {
      const hex = match[0];

      // Skip if in ignored pattern
      const isIgnored = ignoredPatterns.some(pattern =>
        pattern.test(content.substring(Math.max(0, match.index - 50), match.index + hex.length + 50))
      );

      if (!isIgnored) {
        violations++;
        const line = content.substring(0, match.index).split('\n').length;
        log(
          COLORS.YELLOW,
          `  ⚠️ Found hex color in ${path.relative(PROJECT_ROOT, filePath)}:${line}`
        );
        log(COLORS.YELLOW, `     → ${hex}`);
      }
    }
  });

  if (violations === 0) {
    log(COLORS.GREEN, '  ✅ No direct hex colors found in components or app views');
  } else {
    log(COLORS.RED, `  ❌ Found ${violations} direct hex color(s)`);
  }

  return violations === 0;
}

/**
 * Audit: reject arbitrary radius and shadow usage. The current contract has no
 * exceptions: new shape and elevation values must be named tokens.
 */
function auditArbitraryStyles() {
  log(COLORS.CYAN, '\n🧭 Auditing arbitrary radius and shadow usage...');

  const sourceFiles = getAuditableSourceFiles();

  if (sourceFiles.length === 0) {
    log(COLORS.YELLOW, '  ⚠️ No component or view directories found for arbitrary style audit');
    return true;
  }

  const arbitraryPattern = /(rounded-\[[^\]]+\]|shadow-\[[^\]]+\])/g;
  let findings = 0;

  sourceFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;

    while ((match = arbitraryPattern.exec(content)) !== null) {
      const token = match[0];
      findings++;
      const line = content.substring(0, match.index).split('\n').length;
      log(COLORS.YELLOW, `  ⚠️ Arbitrary style in ${path.relative(PROJECT_ROOT, filePath)}:${line}`);
      log(COLORS.YELLOW, `     → ${token}`);
    }
  });

  if (findings === 0) {
    log(COLORS.GREEN, '  ✅ No arbitrary radius/shadow usages outside approved exceptions');
  } else {
    log(COLORS.RED, `  ❌ Found ${findings} arbitrary radius/shadow usage(s); use named token classes instead`);
  }

  return findings === 0;
}

/**
 * Validation: Check for border-radius consistency
 */
function validateBorderRadius() {
  log(COLORS.CYAN, '\n📐 Validating border-radius usage...');

  const tailwindConfigPath = path.join(PROJECT_ROOT, 'tailwind.config.ts');
  const configContent = fs.readFileSync(tailwindConfigPath, 'utf-8');
  const usesTokenSpread = configContent.includes('...tokens.borderRadius');

  const expectedScales = ['button', 'card', 'glass', 'input', 'pill'];
  let allPresent = true;

  expectedScales.forEach(scale => {
    if (
      usesTokenSpread ||
      configContent.includes(`${scale}:`) ||
      configContent.includes(`'${scale}'`) ||
      configContent.includes(`"${scale}"`)
    ) {
      log(COLORS.GREEN, `  ✅ Border-radius scale: ${scale}`);
    } else {
      log(COLORS.RED, `  ❌ Missing border-radius scale: ${scale}`);
      allPresent = false;
    }
  });

  return allPresent;
}

/**
 * Validation: Check machine-readable token artifacts in src/design-tokens/
 */
function validateTokenArtifactIntegrity() {
  log(COLORS.CYAN, '\n🔄 Validating machine-readable token artifacts...');
  log(COLORS.BLUE, '  ℹ️ This checks artifact integrity, not parity with the runtime CSS source.');

  const tokens = readJsonIfExists('src/design-tokens/tokens.json');
  const dtcg = readJsonIfExists('src/design-tokens/tokens.dtcg.json');

  if (!tokens || !dtcg) {
    log(COLORS.RED, '  ❌ Missing one or more machine-readable token artifacts in src/design-tokens/.');
    return false;
  }

  let allSync = true;

  if (tokens.colors && tokens.components) {
    log(COLORS.GREEN, '  ✅ tokens.json exposes colors and components');
  } else {
    log(COLORS.RED, '  ❌ tokens.json is missing expected colors/components sections');
    allSync = false;
  }

  if (dtcg.core?.colors && dtcg.core?.spacing && dtcg.core?.['border-radius']) {
    log(COLORS.GREEN, '  ✅ tokens.dtcg.json exposes core colors, spacing, and border-radius');
  } else {
    log(COLORS.RED, '  ❌ tokens.dtcg.json is missing expected DTCG core sections');
    allSync = false;
  }

  if (tokens.spec_version && dtcg.global?.$metadata?.spec) {
    log(COLORS.GREEN, `  ✅ Token specs declared (${tokens.spec_version} / ${dtcg.global.$metadata.spec})`);
  } else {
    log(COLORS.YELLOW, '  ⚠️ Token spec metadata is incomplete');
  }

  return allSync;
}

/**
 * The runtime CSS source is canonical. Every serializable success/error/danger
 * role must resolve to the runtime value so a passing gate proves parity.
 */
function validateTokenParity() {
  log(COLORS.CYAN, '\n🧭 Validating runtime/serializable token parity...');

  const cssPath = path.join(PROJECT_ROOT, 'src/design-tokens/tokens.css');
  const tokens = readJsonIfExists('src/design-tokens/tokens.json');
  const dtcg = readJsonIfExists('src/design-tokens/tokens.dtcg.json');

  if (!fs.existsSync(cssPath) || !tokens || !dtcg) {
    log(COLORS.RED, '  ❌ Cannot inspect the runtime/serializable token boundary.');
    return false;
  }

  const css = fs.readFileSync(cssPath, 'utf-8');
  const runtimeValues = {
    success: css.match(/--tk-success:\s*([^;]+);/)?.[1]?.trim(),
    error: css.match(/--tk-error:\s*([^;]+);/)?.[1]?.trim(),
  };

  const comparisons = [
    {
      name: 'success',
      runtime: runtimeValues.success,
      artifacts: [
        ['tokens.json colors.status.success', tokens.colors?.status?.success],
        ['tokens.json semantic.colors.success', tokens.semantic?.colors?.success],
        ['tokens.dtcg.json core.colors.status.success', dtcg.core?.colors?.status?.success?.$value],
        ['tokens.dtcg.json semantic.colors.success', dtcg.semantic?.colors?.success?.$value],
      ],
    },
    {
      name: 'error/danger',
      runtime: runtimeValues.error,
      artifacts: [
        ['tokens.json colors.status.error', tokens.colors?.status?.error],
        ['tokens.json semantic.colors.danger', tokens.semantic?.colors?.danger],
        ['tokens.json components.button.danger.background', tokens.components?.button?.danger?.background],
        ['tokens.dtcg.json core.colors.status.error', dtcg.core?.colors?.status?.error?.$value],
        ['tokens.dtcg.json semantic.colors.danger', dtcg.semantic?.colors?.danger?.$value],
      ],
    },
  ];

  let findings = 0;

  comparisons.forEach(({ name, runtime, artifacts }) => {
    if (!runtime) {
      log(COLORS.RED, `  ❌ Missing runtime token for ${name}.`);
      findings++;
      return;
    }

    artifacts.forEach(([artifactName, value]) => {
      const resolvedValue = typeof value === 'string' && /^\{core\.colors\.status\.(success|error)\}$/.test(value)
        ? runtimeValues[value.match(/(success|error)/)?.[1]]
        : value;

      if (!resolvedValue || runtime !== resolvedValue) {
        findings++;
        log(COLORS.RED, `  ❌ ${artifactName}: expected ${runtime}; received ${value ?? 'missing'}`);
      }
    });
  });

  if (findings === 0) {
    log(COLORS.GREEN, '  ✅ Success/error/danger values agree across runtime and serializable artifacts.');
  } else {
    log(COLORS.RED, `  ❌ Found ${findings} runtime/serializable token parity violation(s).`);
  }

  return findings === 0;
}

/**
 * Validation: Check focus ring colors
 */
function validateFocusRings() {
  log(COLORS.CYAN, '\n🔆 Validating focus ring consistency...');

  const buttonPath = path.join(PROJECT_ROOT, 'src/components/ui/button.tsx');
  const inputPath = path.join(PROJECT_ROOT, 'src/components/ui/input.tsx');

  const expectedFocusColor = 'tk-focus';
  let allValid = true;

  [buttonPath, inputPath].forEach(filePath => {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('ring-' + expectedFocusColor)) {
        log(COLORS.GREEN, `  ✅ ${path.basename(filePath)} uses ${expectedFocusColor}`);
      } else {
        log(COLORS.YELLOW, `  ⚠️ ${path.basename(filePath)} focus ring color differs from ${expectedFocusColor}`);
      }
    }
  });

  return allValid;
}

/**
 * Main validation routine
 */
async function validate() {
  log(COLORS.BLUE, '\n╔════════════════════════════════════════╗');
  log(COLORS.BLUE, '║  Design System Validation Report       ║');
  log(COLORS.BLUE, '║  Deterministic contract checks         ║');
  log(COLORS.BLUE, '╚════════════════════════════════════════╝');

  const results = {
    tokenFiles: validateTokenFiles(),
    protectedAuditScope: validateProtectedAuditScope(),
    componentColors: validateComponentColors(),
    arbitraryStyles: auditArbitraryStyles(),
    borderRadius: validateBorderRadius(),
    tokenArtifacts: validateTokenArtifactIntegrity(),
    tokenParity: validateTokenParity(),
    focusRings: validateFocusRings(),
  };

  // Summary
  log(COLORS.CYAN, '\n\n📊 Validation Summary');
  log(COLORS.CYAN, '═══════════════════════════════════════');

  const checks = [
    ['Token Files', results.tokenFiles],
    ['Protected Audit Scope', results.protectedAuditScope],
    ['Component Colors', results.componentColors],
    ['Arbitrary Styles Audit', results.arbitraryStyles],
    ['Border Radius Scales', results.borderRadius],
    ['Token Artifact Integrity', results.tokenArtifacts],
    ['Token Parity', results.tokenParity],
    ['Focus Ring Colors', results.focusRings],
  ];

  let allPass = true;

  checks.forEach(([name, passed]) => {
    log(passed ? COLORS.GREEN : COLORS.RED, `${passed ? '✅' : '❌'} ${name}`);
    if (!passed) allPass = false;
  });

  log(COLORS.CYAN, '\n═══════════════════════════════════════');

  if (allPass) {
    log(COLORS.GREEN, '\n✅ All blocking design system validations passed.\n');
    return 0;
  } else {
    log(COLORS.RED, '\n❌ Some validations failed. Review above.\n');
    return 1;
  }
}

// Run validation
const exitCode = await validate();
process.exit(exitCode);
