# HACK-A-THON 2.0 on Vercel → `yourdomain/hack-a-thon2.0`

The hackathon lives inside this repo and deploys with the rest of the ORIGIN site on Vercel.

| Part | Where |
|---|---|
| Pages: landing, registration, team dashboard, admin | `hack-a-thon2.0/` → `https://yourdomain/hack-a-thon2.0/` |
| Backend | `api/` → Vercel Functions (`/api/register`, `/api/team/*`, `/api/manage/*`) |
| Team data + Team ID counter | Azure Cosmos DB (free tier) |
| Abstract PDFs + payment screenshots | Azure Blob Storage (private) |

URLs after deploy:
- `/hack-a-thon2.0/` landing page (`/hack-a-thon2.0` without the slash redirects here)
- `/hack-a-thon2.0/register.html` registration + Round 1 abstract
- `/hack-a-thon2.0/dashboard.html` team dashboard (reference code + team leader email) → UPI payment → Team ID
- `/hack-a-thon2.0/admin.html` admin (email + password)

---

## 1. Create the database (Azure Cosmos DB)
Azure Portal → **Create a resource** → **Azure Cosmos DB for NoSQL** → Region **Central India**, Capacity **Provisioned throughput**, **Apply Free Tier Discount: Apply** → Create.
Then **Settings → Keys** → copy **PRIMARY CONNECTION STRING**. (The app creates its database and container itself.)

## 2. Create file storage (Azure Blob Storage)
**Create a resource** → **Storage account** → Central India, Standard, **LRS** → Create.
Then **Security + networking → Access keys** → copy **Connection string**. (The app creates a private `abstracts` container itself.)

## 3. Add environment variables in Vercel
Vercel → your project → **Settings → Environment Variables** (Production, and Preview if you use it):

| Name | Value |
|---|---|
| `COSMOS_CONNECTION` | Cosmos DB primary connection string |
| `STORAGE_CONNECTION` | Storage account connection string |
| `ADMIN_EMAIL` | `origin@stpetershyd.com` |
| `ADMIN_PASSWORD_HASH` | output of `npm run hash-password -- "<admin password>"` |
| `SESSION_SECRET` | any long random string (40+ characters) |
| `PAYMENT_UPI_ID` | the college/club UPI ID that receives the fee |
| `PAYMENT_PAYEE_NAME` | name shown in UPI apps, e.g. `ORIGIN SPEC` |
| `FEE_PER_MEMBER` | optional, default `599` |

Only the password **hash** is stored, never the password. These values are secrets: keep them in Vercel only, never in the repo.

## 4. Push
Commit and push to the branch Vercel deploys. Vercel installs the packages from `package.json` and deploys the pages and functions together. No build command or framework setting is needed.

## 5. Test on the live site
1. Register a test team at `/hack-a-thon2.0/register.html` with a small PDF. Note the reference code.
2. Log in at `/hack-a-thon2.0/admin.html` → **Approve** the team.
3. Open `/hack-a-thon2.0/dashboard.html` with the reference code + leader email → scan the QR, pay **₹1 as a test** to your own UPI (or use a test screenshot) → submit.
4. In admin, open the screenshot → **Verify payment** → the team gets **HACK2-001** on its dashboard.
5. Before launch, delete the test team in Cosmos DB **Data Explorer** and set the `counter` item to `"next": 1`.

Add a **Budget** (~$10) with an email alert in Azure **Cost Management**.

---

## How the flow works
1. Team registers + uploads the abstract → gets an 8-character **reference code** → **Under review**.
2. Admin **Approves** → team dashboard shows **Selected** and a UPI QR for team size × ₹599 (₹1,797 / ₹2,396 / ₹2,995).
3. Team pays and uploads the **screenshot + transaction ID (UTR)** → "Registration successful, mail within a few hours" → admin stage **Payment to verify**.
4. Admin checks the money arrived → **Verify payment** → permanent Team ID `HACK2-001`, `HACK2-002`, … on the team's dashboard. **Reject payment** (with a reason) asks the team to pay again. A transaction ID can be used by only one team.
5. Confirmed teams make an "I'm attending" card on the landing page (`#placecard`), prefilled with their Team ID.

The portal sends no emails. Use **Export CSV** in admin (Team ID, stage, amount, transaction ID, members) to mail teams.

## Limits
- Abstract PDF and payment screenshot: **4 MB max** (Vercel limits uploads to 4.5 MB per request).
- Admin login: 8-hour sessions; 5 wrong passwords from one IP → 10-minute lockout.
- Uploads are checked by their content (real PDF / JPG / PNG / WEBP), not just the file name.

## Run it locally
```
npm install
npm test          # 37 API checks
npm run dev       # http://localhost:3000/hack-a-thon2.0/
```
Without the Azure variables the local server saves to `.localdata/` and uses a TEST UPI ID (marked "TEST MODE"). It logs in with the admin email above and the agreed password. On Vercel the app refuses to start without the Azure variables, so it can never silently lose data.
