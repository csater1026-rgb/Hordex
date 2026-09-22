// Hordex — RevenueCat integration (the app's single in-app purchase).
//
// On a real device the RevenueCat Capacitor plugin is registered on the global
// Capacitor bridge, so we can drive it without a bundler. We use the **Test
// Store**, which returns real offerings/entitlements with no App Store / Play
// Console and no paid developer account — ideal for the Next Gen track.
//
// In a plain browser (no native bridge) we fall back to a mock so the paywall
// and gating are fully demoable during development.
//
// Docs: https://www.revenuecat.com/docs/getting-started/installation/capacitor
//       https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store

const CFG = window.HORDEX_CONFIG || {};
const ENTITLEMENT = CFG.ENTITLEMENT_ID || "pro";

function nativePurchases() {
  // The plugin registers itself as `Purchases` on the Capacitor bridge.
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases;
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  return isNative && P ? P : null;
}

// ---- Public API used by the app ----
export const RC = {
  isNative: false,
  ready: false,

  // Configure the SDK once at startup.
  async init() {
    const P = nativePurchases();
    if (!P) { this.isNative = false; this.ready = true; return; }
    this.isNative = true;
    try {
      await P.configure({ apiKey: CFG.REVENUECAT_API_KEY });
      this.ready = true;
    } catch (e) {
      console.warn("RevenueCat configure failed:", e);
      this.ready = false;
    }
  },

  // True if the user currently owns Pro.
  async isPro() {
    const P = nativePurchases();
    if (!P) return mockPro();
    try {
      const { customerInfo } = await P.getCustomerInfo();
      return !!(customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active[ENTITLEMENT]);
    } catch { return false; }
  },

  // Return the packages to show on the paywall: [{id, title, price, pkg}].
  async offerings() {
    const P = nativePurchases();
    if (!P) return mockOfferings();
    try {
      const res = await P.getOfferings();
      const current = res && res.offerings && res.offerings.current;
      const pkgs = (current && current.availablePackages) || [];
      return pkgs.map((pkg) => ({
        id: pkg.identifier,
        title: (pkg.storeProduct && pkg.storeProduct.title) || pkg.identifier,
        price: (pkg.storeProduct && pkg.storeProduct.priceString) || "",
        pkg,
      }));
    } catch (e) { console.warn("getOfferings failed", e); return []; }
  },

  // Purchase a package; resolves true if Pro is now active.
  async purchase(entry) {
    const P = nativePurchases();
    if (!P) return mockPurchase();
    try {
      const { customerInfo } = await P.purchasePackage({ aPackage: entry.pkg });
      return !!(customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active[ENTITLEMENT]);
    } catch (e) {
      if (e && e.userCancelled) return false;
      console.warn("purchase failed", e);
      return false;
    }
  },

  async restore() {
    const P = nativePurchases();
    if (!P) return mockPro();
    try {
      const { customerInfo } = await P.restorePurchases();
      return !!(customerInfo && customerInfo.entitlements && customerInfo.entitlements.active && customerInfo.entitlements.active[ENTITLEMENT]);
    } catch { return false; }
  },
};

// ---- Web-preview mock (no native bridge). Lets the paywall be demoed in a browser.
function mockKey() { return "hordex_mock_pro"; }
function mockPro() { try { return localStorage.getItem(mockKey()) === "1"; } catch { return false; } }
function mockOfferings() {
  return [
    { id: "monthly", title: "Hordex Pro (monthly)", price: "$9.99", pkg: { identifier: "monthly" } },
    { id: "lifetime", title: "Hordex Pro (lifetime)", price: "$49.99", pkg: { identifier: "lifetime" } },
  ];
}
function mockPurchase() { try { localStorage.setItem(mockKey(), "1"); } catch {} return true; }
