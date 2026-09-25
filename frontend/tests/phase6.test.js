/**
 * MessMate - PHASE 6A tests (DateTimePicker deprecation regression).
 *
 * WHAT THIS PROTECTS
 * ------------------
 * @react-native-community/datetimepicker 9.1.0 deprecated the combined
 * `onChange` callback and prints:
 *
 *   WARN DateTimePicker: `onChange` is deprecated. Use `onValueChange`,
 *   `onDismiss`, and `onNeutralButtonPress` instead.
 *
 * The warning is emitted by `warnIfOnChangeIsUsed(onChange)` (iOS render path
 * and Android `open()`), which only fires when the `onChange` PROP is truthy.
 * Phase 6A moved all three DateTimePicker instances to the current API without
 * changing any observable behaviour. These tests pin that migration down:
 *
 *   - no DateTimePicker instance in src/ receives `onChange` any more;
 *   - every instance uses `onValueChange`, and the dialog instances also use
 *     `onDismiss` / `onNeutralButtonPress`;
 *   - selection still commits, cancel/dismiss still never commits;
 *   - maximumDate/minimumDate bounds and the future-join-date validation are
 *     untouched;
 *   - the installed package version and dependency list are unchanged;
 *   - the INSTALLED warning guard itself is executed to prove it stays silent
 *     for the props we now pass (and still fires for onChange - control).
 *
 * Everything runs offline and never renders React Native components (no new
 * test dependency is allowed): screen files are checked as source text and
 * must COMPILE through Babel, exactly like Phases 4 and 5.
 *
 * Run:  node tests/phase6.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const harness = require('./harness');

const reporter = harness.createReporter('PHASE 6 TESTS');
const { check, eq, section, finish, failures } = reporter;

/* Every <DateTimePicker ... /> instance in a source string. */
function pickerBlocks(src) {
  return src.match(/<DateTimePicker[\s\S]*?\/>/g) || [];
}

/** Substring between two unique markers (inclusive-exclusive). */
function between(src, startMarker, endMarker) {
  const from = src.indexOf(startMarker);
  const to = src.indexOf(endMarker, from + 1);
  return from === -1 || to === -1 ? null : src.slice(from, to);
}

async function main() {
  console.log('PHASE 6 FRONTEND TESTS');

  const join = harness.readSource('src/components/JoinDateField.js');
  const meals = harness.readSource('src/screens/MealsScreen.js');
  const signup = harness.readSource('src/screens/SignupScreen.js');
  const pkg = harness.readJSON('package.json');

  /* ---------------------------------------------------------------- */
  section('1. files, dependencies, installed package');
  /* ---------------------------------------------------------------- */
  check('JoinDateField exists', harness.exists('src/components/JoinDateField.js'));
  check('MealsScreen exists', harness.exists('src/screens/MealsScreen.js'));
  check('patch script untouched', harness.exists('scripts/apply-metro-onedrive-patch.js'));
  eq('no dependency added or removed', Object.keys(pkg.dependencies).length, 20);
  eq(
    'datetimepicker stays at the installed version',
    pkg.dependencies['@react-native-community/datetimepicker'],
    '9.1.0'
  );
  const installed = harness.readJSON(
    'node_modules/@react-native-community/datetimepicker/package.json'
  );
  eq('installed version matches the declaration', installed.version, '9.1.0');

  /* ---------------------------------------------------------------- */
  section('2. the installed API really offers the current callbacks');
  /* ---------------------------------------------------------------- */
  const dtpTypes = harness.readSource(
    'node_modules/@react-native-community/datetimepicker/src/types.js'
  );
  check('types.js declares onValueChange', dtpTypes.includes('onValueChange?:'));
  check('types.js declares onDismiss', dtpTypes.includes('onDismiss?:'));
  check('types.js declares onNeutralButtonPress', dtpTypes.includes('onNeutralButtonPress?:'));
  check(
    'types.js marks onChange deprecated',
    dtpTypes.includes('@deprecated Use onValueChange, onDismiss, and onNeutralButtonPress instead.')
  );
  const dtpUtils = harness.readSource(
    'node_modules/@react-native-community/datetimepicker/src/utils.js'
  );
  check(
    'the warning guard is keyed purely on the onChange prop',
    dtpUtils.includes('if (__DEV__ && onChange && !hasWarnedOnChange)')
  );

  /* ---------------------------------------------------------------- */
  section('3. no deprecated onChange reaches any DateTimePicker');
  /* ---------------------------------------------------------------- */
  const joinBlocks = pickerBlocks(join);
  const mealsBlocks = pickerBlocks(meals);
  eq('JoinDateField renders exactly 2 picker instances', joinBlocks.length, 2);
  eq('MealsScreen renders exactly 1 picker instance', mealsBlocks.length, 1);
  const allBlocks = [...joinBlocks, ...mealsBlocks];
  eq('3 DateTimePicker instances in total', allBlocks.length, 3);
  allBlocks.forEach((block, i) => {
    check(`instance ${i + 1} has no onChange prop`, !/\bonChange\s*=/.test(block));
    check(`instance ${i + 1} uses onValueChange`, /onValueChange=/.test(block));
  });
  check(
    'no dismissed-event branching left in src',
    !/type === ['"]dismissed['"]/.test(join) && !/type === ['"]dismissed['"]/.test(meals)
  );
  check('no legacy event?.type sniffing left', !join.includes('event?.type'));

  /* ---------------------------------------------------------------- */
  section('4. current API wired per platform');
  /* ---------------------------------------------------------------- */
  const [iosBlock, androidBlock] = joinBlocks;
  check('iOS spinner block keeps display="spinner"', iosBlock.includes('display="spinner"'));
  check('Android dialog block keeps display="calendar"', androidBlock.includes('display="calendar"'));
  check('Android dialog uses onDismiss', androidBlock.includes('onDismiss='));
  check('Android dialog uses onNeutralButtonPress', androidBlock.includes('onNeutralButtonPress='));
  check(
    'no neutral BUTTON is configured (nothing new can appear in the UI)',
    !/(?<![A-Za-z])neutralButton\s*=/.test(join + meals)
  );
  const mealBlock = mealsBlocks[0];
  check('Meals picker uses onDismiss', mealBlock.includes('onDismiss='));
  check('Meals picker uses onNeutralButtonPress', mealBlock.includes('onNeutralButtonPress='));
  check(
    'Meals keeps the per-platform display',
    mealBlock.includes("Platform.OS === 'ios' ? 'inline' : 'calendar'")
  );
  check(
    'Meals keeps its date bounds',
    mealBlock.includes('minimumDate=') && mealBlock.includes('maximumDate=')
  );
  check(
    'iOS instance keeps minimumDate/maximumDate',
    iosBlock.includes('maximumDate=') && iosBlock.includes('minimumDate=')
  );
  check(
    'Android instance keeps minimumDate/maximumDate',
    androidBlock.includes('maximumDate=') && androidBlock.includes('minimumDate=')
  );

  /* ---------------------------------------------------------------- */
  section('5. selection behaviour preserved');
  /* ---------------------------------------------------------------- */
  const valueBody = /function handleValueChange\(_event, selected\) \{([\s\S]*?)\n  \}/.exec(join);
  check('handleValueChange exists', !!valueBody);
  check(
    'a picked day is committed as YYYY-MM-DD',
    !!valueBody && valueBody[1].includes('onChange(toDateString(selected))')
  );
  check('commit is guarded on a real selection', !!valueBody && valueBody[1].includes('if (selected)'));
  check(
    'Android dialog closes after a selection',
    !!valueBody && valueBody[1].includes("Platform.OS === 'android') setAndroidOpen(false)")
  );
  const mealsValue = between(meals, 'const onPickerValueChange', 'const onPickerDismiss');
  check('Meals selection still navigates to the day', !!mealsValue && mealsValue.includes('goToDate(toDateString(picked))'));
  check(
    'Meals closes only on Android after a selection (iOS inline stays open)',
    !!mealsValue && mealsValue.includes("Platform.OS === 'android') setPickerOpen(false)")
  );
  check(
    'JoinDateField still exposes its own onChange prop to the parent',
    join.includes('onChange,') && join.includes('onChange(toDateString(selected))')
  );
  check('SignupScreen still drives it with setJoinDate', signup.includes('onChange={setJoinDate}'));

  /* ---------------------------------------------------------------- */
  section('6. cancel/dismiss behaviour preserved');
  /* ---------------------------------------------------------------- */
  const dismissBody = /function handleDismiss\(\) \{([\s\S]*?)\n  \}/.exec(join);
  check('handleDismiss exists', !!dismissBody);
  check('cancel never commits a date', !!dismissBody && !dismissBody[1].includes('onChange('));
  check('cancel closes the Android dialog', !!dismissBody && dismissBody[1].includes('setAndroidOpen(false)'));
  const mealsDismiss = between(meals, 'const onPickerDismiss', 'const onPickerNeutral');
  check('Meals cancel only closes the picker', !!mealsDismiss && mealsDismiss.includes('setPickerOpen(false)'));
  check('Meals cancel never navigates', !!mealsDismiss && !mealsDismiss.includes('goToDate'));

  /* ---------------------------------------------------------------- */
  section('7. future join date stays blocked');
  /* ---------------------------------------------------------------- */
  check('JoinDateField defaults maximumDate to today', join.includes('maximumDate = new Date()'));
  check('SignupScreen passes maximumDate={new Date()}', signup.includes('maximumDate={new Date()}'));
  check('signup still rejects impossible dates', signup.includes('isRealDateString(joinDate)'));
  check('signup still rejects future dates', signup.includes('isFutureDateString(joinDate)'));
  check(
    'the future-date error message is unchanged',
    signup.includes('The join date cannot be in the future.')
  );
  check('no screen ever mentions a fake future allowance', !/allowFuture|maxDate\s*=\s*null/.test(signup + join));

  /* ---------------------------------------------------------------- */
  section('8. the modified screens compile (Babel, like Phases 4/5)');
  /* ---------------------------------------------------------------- */
  const babel = require('@babel/core');
  const jsx = require.resolve('@babel/plugin-transform-react-jsx');
  const cjs = require.resolve('@babel/plugin-transform-modules-commonjs');
  const broken = [];
  for (const rel of [
    'src/components/JoinDateField.js',
    'src/screens/MealsScreen.js',
    'src/screens/SignupScreen.js',
  ]) {
    try {
      babel.transformFileSync(path.join(harness.ROOT, rel), {
        cwd: harness.ROOT,
        root: harness.ROOT,
        plugins: [jsx, cjs],
        babelrc: false,
        configFile: false,
      });
    } catch (e) {
      broken.push(`${rel}: ${e.message.split('\n')[0]}`);
    }
  }
  check('all touched screens compile', broken.length === 0, broken.join(' | '));

  /* ---------------------------------------------------------------- */
  section('9. the INSTALLED warning guard, executed');
  /* ---------------------------------------------------------------- */
  // Compile the package's own utils.js (Flow + ESM) with the Babel that Expo
  // ships, then drive warnIfOnChangeIsUsed exactly as DateTimePicker does.
  const buildDir = path.join(harness.ROOT, '.phase6-build');
  try {
    fs.rmSync(buildDir, { recursive: true, force: true });
    fs.mkdirSync(buildDir, { recursive: true });
    const utilsPath = path.join(
      harness.ROOT,
      'node_modules',
      '@react-native-community',
      'datetimepicker',
      'src',
      'utils.js'
    );
    const out = babel.transformFileSync(utilsPath, {
      cwd: harness.ROOT,
      root: harness.ROOT,
      plugins: [require.resolve('@babel/plugin-transform-flow-strip-types'), cjs],
      babelrc: false,
      configFile: false,
    });
    const built = path.join(buildDir, 'dtp-utils.js');
    fs.writeFileSync(built, out.code, 'utf8');

    global.__DEV__ = true;
    const guard = require(built).warnIfOnChangeIsUsed;
    check('the installed guard loads', typeof guard === 'function');

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      // What our code now passes: the prop is absent -> undefined.
      guard(undefined);
      eq('no onChange prop -> warning stays silent', warnings.length, 0);
      // Control: with a truthy onChange the warning still fires (the package
      // itself is unchanged - only our props moved to the current API).
      guard(function onChange() {});
      eq('control: onChange prop -> warning fires', warnings.length, 1);
      check(
        'the emitted text is the reported deprecation warning',
        warnings.length === 1 &&
          warnings[0].includes('DateTimePicker: `onChange` is deprecated.')
      );
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    delete global.__DEV__;
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  /* ---------------------------------------------------------------- */
  section('10. nothing here needs the internet');
  /* ---------------------------------------------------------------- */
  eq('no network call was made', harness.network.calls().length, 0);

  return finish();
}

main()
  .then((f) => {
    process.exit(f > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    failures.push(e.message);
    finish();
    process.exit(1);
  });
