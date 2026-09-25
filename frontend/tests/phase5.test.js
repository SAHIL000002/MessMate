'use strict';
const fs = require('fs');
const path = require('path');
const harness = require('./harness');
const SOURCES = [
  'src/utils/date.js',
  'src/utils/cycle.js',
  'src/utils/mealHistory.js',
  'src/utils/mealStatus.js',
  'src/utils/user.js',
  'src/services/api.js',
  'src/services/storage.js',
  'src/services/sync.js',
  'src/services/meals.js',
  'src/services/report.js',
];
const reporter = harness.createReporter('PHASE 5 TESTS');
const { check, eq, section, finish, failures } = reporter;
let app = null;
let device = null;
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return app.date.toDateString(d);
}
function sourceFiles(dir = 'src', found = []) {
  for (const e of fs.readdirSync(path.join(harness.ROOT, dir), { withFileTypes: true })) {
    const r = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceFiles(r, found);
    else if (e.name.endsWith('.js')) found.push(r);
  }
  return found;
}
async function main() {
  console.log('PHASE 5 FRONTEND TESTS');
  harness.compile(SOURCES);
  device = harness.createDevice();
  app = harness.launch(device, SOURCES);
  harness.network.goOffline();
  app.sync.forgetOnlineState();
  section('1. files exist, no new deps');
  const FILES = ['src/context/MealContext.js','src/services/report.js','src/screens/ProfileScreen.js','src/screens/HomeScreen.js','src/screens/MealsScreen.js','src/components/MealStatusCard.js','src/components/CycleCard.js','src/components/MessMateLogo.js','src/utils/cycle.js','src/utils/mealHistory.js','src/services/meals.js','src/services/storage.js','src/services/sync.js','tests/phase5.test.js'];
  for (const f of FILES) check(`exists: ${f}`, harness.exists(f));
  check('one logo only', fs.readdirSync(path.join(harness.ROOT,'src/components')).filter((n)=>/logo/i.test(n)).length===1);
  const deps = harness.readJSON('package.json').dependencies || {};
  const EXP = ['@expo-google-fonts/plus-jakarta-sans','@expo/vector-icons','@react-native-async-storage/async-storage','@react-native-community/datetimepicker','@react-navigation/bottom-tabs','@react-navigation/native','@react-navigation/native-stack','axios','expo','expo-constants','expo-file-system','expo-font','expo-print','expo-sharing','expo-status-bar','expo-system-ui','react','react-native','react-native-safe-area-context','react-native-screens'];
  eq('no dep added/removed', Object.keys(deps).sort(), EXP.slice().sort());
  for (const b of ['redux','@reduxjs/toolkit','zustand','mobx','realm','@nozbe/watermelondb','expo-sqlite','@react-native-community/netinfo','socket.io-client','react-native-svg','chart.js','victory-native']) check(`not installed: ${b}`, !deps[b]);
  section('2. src compiles');
  const babel = require('@babel/core');
  const cjs = require.resolve('@babel/plugin-transform-modules-commonjs');
  const jsx = require.resolve('@babel/plugin-transform-react-jsx');
  const files = sourceFiles();
  const broken = [];
  for (const r of files) {
    try { babel.transformFileSync(path.join(harness.ROOT,r),{cwd:harness.ROOT,root:harness.ROOT,plugins:[jsx,cjs],babelrc:false,configFile:false}); }
    catch (e) { broken.push(`${r}: ${e.message.split('\n')[0]}`); }
  }
  check(`all ${files.length} compile`, broken.length===0, broken.join(' | '));
  section('3. tabs HOME|MEALS|PROFILE');
  const tabs = harness.readSource('src/navigation/MainTabs.js');
  eq('order', [...tabs.matchAll(/name: '([A-Za-z]+)',\s*\n\s*label: '([A-Z]+)'/g)].map((m)=>m[1]), ['Home','Meals','Profile']);
  eq('labels', [...tabs.matchAll(/label: '([A-Z]+)'/g)].map((m)=>m[1]), ['HOME','MEALS','PROFILE']);
  for (const f of ['Progress','Records','Settings','Dashboard','Analytics','Reports']) check(`no ${f} tab`, !tabs.includes(f));
  check('PROFILE real', tabs.includes("from '../screens/ProfileScreen'") && tabs.includes('component: ProfileScreen'));
  check('placeholder unrouted', !tabs.includes('ProfilePlaceholderScreen'));
  const today = app.date.todayString();
  section('4. shared meal state');
  const ctx = harness.readSource('src/context/MealContext.js');
  const homeS = harness.readSource('src/screens/HomeScreen.js');
  const mealS = harness.readSource('src/screens/MealsScreen.js');
  const profS = harness.readSource('src/screens/ProfileScreen.js');
  check('provider+hook', ctx.includes('export function MealProvider') && ctx.includes('export function useMeals'));
  check('no redux', !/from ['"]redux|require\(['"]redux|from ['"]zustand|from ['"]mobx/i.test(ctx));
  check('notify read', ctx.includes('subscribeToMealChanges'));
  check('mounted at root', harness.readSource('App.js').includes('<MealProvider>'));
  check('Home shared', homeS.includes('useMeals()'));
  check('Meals shared', mealS.includes('useMeals()'));
  check('Profile shared', profS.includes('useMeals()'));
  check('Home markMeal', homeS.includes('markMeal({'));
  check('Meals markMeal', mealS.includes('markMeal({'));
  check('Home no direct write', !/saveLocalMeal|updateLocalMeal|mergeLocalMeals|savePendingSync/.test(homeS));
  check('Meals no direct write', !/saveLocalMeal|updateLocalMeal|mergeLocalMeals|savePendingSync/.test(mealS));
  section('5. HOME<->MEALS offline agreement');
  const SID = '65f50000000000000000ee11';
  const SJOIN = daysAgo(20);
  await app.meals.markMeal({ userId: SID, date: today, meal: 'breakfast', status: 'eaten', joinDate: SJOIN });
  let sum = await app.meals.getTodaySummary(SID, { joinDate: SJOIN, date: today });
  let rows = await app.meals.getMealHistory(SID, { joinDate: SJOIN, today });
  eq('Home B EATEN', sum.meal.breakfast, 'eaten');
  eq('Meals B EATEN no refresh', rows.find((r) => r.date === today).breakfast, 'eaten');
  await app.meals.markMeal({ userId: SID, date: today, meal: 'breakfast', status: 'not_eaten', joinDate: SJOIN });
  sum = await app.meals.getTodaySummary(SID, { joinDate: SJOIN, date: today });
  rows = await app.meals.getMealHistory(SID, { joinDate: SJOIN, today });
  eq('Meals->Home B', sum.meal.breakfast, 'not_eaten');
  eq('Meals stays B', rows.find((r) => r.date === today).breakfast, 'not_eaten');
  await app.meals.markMeal({ userId: SID, date: today, meal: 'dinner', status: 'eaten', joinDate: SJOIN });
  sum = await app.meals.getTodaySummary(SID, { joinDate: SJOIN, date: today });
  eq('Home D EATEN', sum.meal.dinner, 'eaten');
  rows = await app.meals.getMealHistory(SID, { joinDate: SJOIN, today });
  eq('Meals D matches', rows.find((r) => r.date === today).dinner, 'eaten');
  await app.meals.markMeal({ userId: SID, date: today, meal: 'dinner', status: 'not_eaten', joinDate: SJOIN });
  sum = await app.meals.getTodaySummary(SID, { joinDate: SJOIN, date: today });
  eq('Meals->Home D', sum.meal.dinner, 'not_eaten');
  eq('meals independent', sum.meal.breakfast, 'not_eaten');
  const re = harness.launch(device, SOURCES);
  const rr = await re.meals.getMealHistory(SID, { joinDate: SJOIN, today });
  eq('restart keeps B', rr.find((r) => r.date === today).breakfast, 'not_eaten');
  eq('restart keeps D', rr.find((r) => r.date === today).dinner, 'not_eaten');
  section('6. cycles independent + boundary');
  const CID = '65f50000000000000000ee22';
  const CJOIN = daysAgo(60);
  for (let b = 11; b >= 0; b -= 1) await app.meals.markMeal({ userId: CID, date: daysAgo(b), meal: 'breakfast', status: 'eaten', joinDate: CJOIN });
  for (let b = 7; b >= 0; b -= 1) await app.meals.markMeal({ userId: CID, date: daysAgo(b), meal: 'dinner', status: 'eaten', joinDate: CJOIN });
  let st = app.cycle.buildUserStats(await app.storage.getLocalMeals(CID), { joinDate: CJOIN, today });
  eq('B 12/30', [st.breakfast.currentCycle, st.breakfast.eatenInCurrentCycle], [1, 12]);
  eq('D 8/30', [st.dinner.currentCycle, st.dinner.eatenInCurrentCycle], [1, 8]);
  const BID = '65f50000000000000000ee33';
  const BJOIN = daysAgo(90);
  for (let b = 29; b >= 0; b -= 1) await app.meals.markMeal({ userId: BID, date: daysAgo(b), meal: 'breakfast', status: 'eaten', joinDate: BJOIN });
  const bs = app.cycle.buildUserStats(await app.storage.getLocalMeals(BID), { joinDate: BJOIN, today });
  eq('30 completes c1', bs.breakfast.cycleComplete, true);
  eq('c2 at 0/30', [bs.breakfast.currentCycle, bs.breakfast.eatenInCurrentCycle], [2, 0]);
  eq('30 rows survive', (await app.storage.getLocalMeals(BID)).length, 30);
  section('7. expected dates live+independent+honest');
  check('B date with pace', Boolean(st.expected.breakfast.date));
  check('D date independent', Boolean(st.expected.dinner.date));
  const dBefore = st.expected.dinner.date;
  await app.meals.markMeal({ userId: CID, date: daysAgo(13), meal: 'breakfast', status: 'eaten', joinDate: CJOIN });
  st = app.cycle.buildUserStats(await app.storage.getLocalMeals(CID), { joinDate: CJOIN, today });
  check('B recalculates', st.expected.breakfast.date !== null);
  eq('B move keeps D', st.expected.dinner.date, dBefore);
  check('real day', app.date.isRealDateString(st.expected.breakfast.date));
  const empty = app.cycle.buildUserStats([], { joinDate: daysAgo(10), today });
  eq('empty->null', empty.expected.breakfast.date, null);
  check('honest label', app.cycle.expectedLabel(empty.expected.breakfast).includes('Not enough data'));
  eq('single->null', app.cycle.expectedCompletion([today], { today, cycle: app.cycle.buildCycle(1) }).date, null);
  const card = harness.readSource('src/components/CycleCard.js');
  check('card expectedLabel', card.includes('expectedLabel('));
  section('8. buttons marked/unmarked');
  const opt = harness.readSource('src/components/MealStatusCard.js');
  check('MARK EATEN', opt.includes('MARK EATEN'));
  check('MARK NOT EATEN', opt.includes('MARK NOT EATEN'));
  check('selected state', opt.includes('selected'));
  check('unrecorded selects none', /isRecorded|NOT RECORDED|Not recorded yet/.test(opt));
  section('9. profile rules');
  check('logo', profS.includes('<MessMateLogo'));
  check('avatar', profS.includes('initialsFor('));
  check('username', profS.includes('displayName('));
  check('joindate', profS.includes('formatDisplayDate('));
  check('no secrets', !profS.includes('user.password'));
  check('SYNC RECORDS', /SYNC RECORDS/.test(profS));
  check('sync fn', profS.includes('syncNow()') || profS.includes('syncUserData('));
  check('DOWNLOAD REPORT', /DOWNLOAD REPORT/.test(profS));
  check('share local', profS.includes('shareMealReport('));
  check('offline friendly', /offline/i.test(profS));
  check('logout', profS.includes('signOut()'));
  check('no api direct', !profS.includes('services/api'));
  check('no iso dates', !profS.includes('toISOString'));
  check('no fake status', !profS.includes('not_recorded'));
  harness.network.reset();
  const off = await app.sync.syncUserData(CID);
  eq('offline honest', [off.ok, off.online], [false, false]);
  check('offline kind', /Offline/i.test(off.message), off.message);
  section('10. PDF offline full-history honest totals');
  const user = { id: CID, username: 'Report Tester', email: 'report@example.com', joinDate: CJOIN };
  const loc = await app.storage.getLocalMeals(CID);
  const pend = await app.storage.getPendingSync(CID);
  const rep = app.report.buildReportHtml({ user, meals: loc, pending: pend, today });
  check('username', rep.html.includes('Report Tester'));
  check('email', rep.html.includes('report@example.com'));
  check('joindate shown', rep.html.includes(app.date.formatDisplayDate(CJOIN)));
  check('end date shown', rep.html.includes(app.date.formatDisplayDate(today)));
  eq('all dates covered', rep.rows.length, app.date.daysBetween(CJOIN, today) + 1);
  const tRow = rep.rows.find((r) => r.date === today);
  const hToday = (await app.meals.getTodaySummary(CID, { joinDate: CJOIN, date: today })).meal;
  eq('PDF=Home B', app.mealStatus.statusLabel(tRow.breakfast), app.mealStatus.statusLabel(hToday && hToday.breakfast));
  check('NOT RECORDED', rep.html.includes('NOT RECORDED'));
  check('no PENDING', !rep.html.includes('PENDING'));
  check('no NOT MARKED', !rep.html.includes('NOT MARKED'));
  check('no snake fake', !rep.html.includes('not_recorded'));
  const cs = app.cycle.buildUserStats(loc, { joinDate: CJOIN, today });
  eq('B total', rep.totals.breakfast, cs.totalBreakfastEaten);
  eq('D total', rep.totals.dinner, cs.totalDinnerEaten);
  // Phase 8B: the combined breakfast+dinner figure was removed from the report
  // on purpose. This assertion used to read `rep.totals.combined`; it now
  // proves the field is gone and that nothing combined is printed either.
  check('no combined field', !('combined' in rep.totals));
  check('no combined printed', !/combined/i.test(rep.html));
  check('queued offline', pend.length > 0);
  check('unsynced note', /not uploaded yet/.test(rep.html));
  check('pdf name', app.report.reportFileName(user, today).endsWith('.pdf'));
  check('name has member', app.report.reportFileName(user, today).includes('report-tester'));
  const repSrc = harness.readSource('src/services/report.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  check('report dates local (no iso in date code)', !/toISOString/.test(repSrc));
  eq('still offline', harness.network.calls().filter((c) => /\/meals|\/auth\//.test(c.url)).length, 0);
  return finish();
}
main().then((f) => { process.exit(f > 0 ? 1 : 0); }).catch((e) => { console.error(e); failures.push(e.message); finish(); process.exit(1); });
