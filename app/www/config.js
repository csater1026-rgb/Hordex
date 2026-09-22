// Hordex mobile app configuration.
// Fill these in before you build the Android app (see paywall/revenuecat-setup.md).
window.HORDEX_CONFIG = {
  // The URL of your deployed swarm backend (Railway / Render / Fly).
  // Leave "" to use the field in the app's Settings sheet at runtime.
  BACKEND_URL: "",

  // RevenueCat **Test Store** public API key (starts with "test_...").
  // Test Store needs no App Store / Play Console and no paid account.
  REVENUECAT_API_KEY: "test_REPLACE_WITH_YOUR_TEST_STORE_KEY",

  // The entitlement that unlocks Pro, and the offering to show on the paywall.
  ENTITLEMENT_ID: "pro",
  OFFERING_ID: "default"
};
