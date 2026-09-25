/**
 * MessMate - the signed-in bottom navigation.
 *
 * Exactly three tabs: HOME | MEALS | PROFILE.
 *
 * All three are real screens now: Home (today + the 30-meal counters), Meals
 * (per-date editing + the full history) and Profile (details, SYNC RECORDS, the
 * PDF report and LOGOUT).
 *
 * The bar follows the Stitch Home mockup: a translucent white bar with a soft
 * emerald divider on top, emerald icon + label + a small dot for the active
 * tab, and muted grey for the others. Icons come from the icon font that
 * already ships with `@expo/vector-icons`, so nothing new is installed and
 * nothing is fetched at runtime.
 */

import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius } from '../constants/theme';
import HomeScreen from '../screens/HomeScreen';
import MealsScreen from '../screens/MealsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const TABS = [
  {
    name: 'Home',
    label: 'HOME',
    icon: 'home',
    iconOutline: 'home-outline',
    component: HomeScreen,
  },
  {
    name: 'Meals',
    label: 'MEALS',
    icon: 'silverware-fork-knife',
    iconOutline: 'silverware-fork-knife',
    component: MealsScreen,
  },
  {
    name: 'Profile',
    label: 'PROFILE',
    icon: 'account',
    iconOutline: 'account-outline',
    component: ProfileScreen,
  },
];

function TabIcon({ focused, color, icon, iconOutline }) {
  return (
    <View style={styles.iconWrap}>
      <MaterialCommunityIcons
        name={focused ? icon : iconOutline}
        size={22}
        color={color}
      />
      <View style={[styles.dot, focused ? styles.dotActive : null]} />
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryContainer,
        tabBarInactiveTintColor: colors.outline,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: tab.label,
            tabBarIcon: ({ focused, color }) => (
              <TabIcon focused={focused} color={color} icon={tab.icon} iconOutline={tab.iconOutline} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    paddingTop: 6,
  },
  item: {
    paddingBottom: 4,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  dotActive: {
    backgroundColor: colors.primaryContainer,
  },
});
