# RevenueCat setup (Test Store — no paid account needed)

Hordex's single in-app purchase is powered by **RevenueCat**, using the **Test
Store**. The Test Store is a real store object inside RevenueCat that serves
offerings and records purchases **without App Store Connect or Google Play, and
without a paid Apple/Google developer account** — exactly what the Next Gen
track needs. (Docs: RevenueCat → Test & Launch → Sandbox → Test Store.)

> Never ship a Test Store API key to a real app-store release. It's for
> testing/demo builds only — which is all Next Gen requires.

## 1. Create the project + Test Store

1. Sign up at [app.revenuecat.com](https://app.revenuecat.com) (free).
2. Create a **Project** (e.g. "Hordex").
3. A **Test Store** app is provisioned automatically. Open **Project settings →
   Apps** and select the **Test Store** app. Copy its **public API key**
   (starts with `test_…`).

## 2. Create the entitlement, product, and offering

1. **Entitlements → +New**: identifier **`pro`**. This is the switch the app
   checks to unlock Pro.
2. **Products → +New** (under the Test Store app): create two, e.g.
   - `hordex_pro_monthly` — a monthly subscription
   - `hordex_pro_lifetime` — a lifetime / non-consumable
   Attach both products to the **`pro`** entitlement.
3. **Offerings → +New**: identifier **`default`**. Add two **packages**:
   - Monthly → `hordex_pro_monthly`
   - Lifetime → `hordex_pro_lifetime`
   Mark the `default` offering as **current**.

## 3. Point the app at it

Edit `app/www/config.js`:

```js
window.HORDEX_CONFIG = {
  BACKEND_URL: "https://your-swarm-backend.up.railway.app",
  REVENUECAT_API_KEY: "test_XXXXXXXXXXXXXXXXXXXX",   // Test Store public key
  ENTITLEMENT_ID: "pro",
  OFFERING_ID: "default"
};
```

## 4. Run a purchase (the thing the judges see)

On a real Android device/emulator with the app installed (see `app/README.md`):

1. Tap **Unlock Pro** → the paywall lists your `default` offering's packages.
2. Tap a package → the Test Store completes a **sandbox purchase** (no real
   money, no card).
3. RevenueCat returns `customerInfo` with the **`pro`** entitlement active →
   the app flips to **PRO**, raising the swarm cap to 20 and revealing the full
   security sweep + export.

That end-to-end flow — offering shown, purchase made, entitlement unlocked — is
the RevenueCat integration the Shipaton requires, and it's what your demo video
should capture.

## How the code uses it

`app/www/revenuecat.js` drives the RevenueCat Capacitor plugin
(`@revenuecat/purchases-capacitor`) via the Capacitor bridge:
`configure` → `getOfferings` → `purchasePackage` → check
`customerInfo.entitlements.active["pro"]`, with `restorePurchases` wired to the
Settings sheet. In a plain browser (no native bridge) it falls back to a mock so
the paywall is demoable during development. When you build the app, confirm the
plugin's method names against the version you install (they occasionally change
across majors) — the shapes used here match `@revenuecat/purchases-capacitor` v9.
