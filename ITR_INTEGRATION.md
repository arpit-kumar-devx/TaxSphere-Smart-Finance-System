# TaxSphere — ITR SaaS integration guide

This document describes the **end-to-end ITR module**, **Razorpay payments**, **document uploads**, **CA dashboard**, **admin panel**, and **role-based access** added to TaxSphere.

## Architecture

| Layer | Path |
|--------|------|
| ITR API (USER) | `GET/POST /api/v1/itr`, `PATCH /api/v1/itr/:id`, `POST .../calculate`, `POST .../submit-for-payment` |
| Documents | `POST /api/v1/documents/itr/:itrId` (multipart, field `file`; form field `type`) |
| Payment | `POST /api/v1/payment/create-order`, `POST /api/v1/payment/verify` |
| CA | `GET /api/v1/ca/itr`, `PATCH /api/v1/ca/itr/:itrId/documents/:docId`, `PATCH /api/v1/ca/itr/:id/status` |
| Admin | `GET /api/v1/admin/stats`, `GET .../users`, `GET .../cas`, `GET .../itr`, `PATCH .../itr/:id/assign-ca`, `PATCH .../users/:userId/role` |
| Static files | `GET /uploads/itr-docs/*` (served from server `uploads/`) |

Roles: **`USER`**, **`CA`**, **`ADMIN`** on the `User` model. JWT is unchanged; `authenticateToken` loads the user (including `role`) from MongoDB on each request.

## Environment variables (server)

Add to `Full-Stack/server/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/taxsphere
JWT_SECRET=your_long_secret
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
# Optional: filing fee in paise (default 49900 = ₹499)
RAZORPAY_FILING_AMOUNT_PAISE=49900
```

Without Razorpay keys, `POST /api/v1/payment/create-order` returns **503** with a clear message.

## First-time bootstrap (roles)

There is no public “become admin” endpoint. Promote your account in MongoDB once:

```js
// mongosh
use taxsphere
db.users.updateOne(
  { email: "kumararpit9438@gmail.com" },
  { $set: { role: "ADMIN" } }
)
```

1. Register/login as that user → app sends you to **`/admin`** (login redirect by role).
2. In **Admin → Promote user role**, set another account to **`CA`**.
3. Taxpayers stay **`USER`** (default on register).

After changing **your own** role, **log out and log in again** so the client refreshes the profile (or call `GET /api/v1/auth/me`).

## User flow (browser)

1. **`/itr`** — list filings; **New ITR** creates a draft.
2. **`/itr/:id`** — multi-step wizard (profile, income, deductions, tax, documents).
3. **Calculate** runs the server tax engine; **File ITR — proceed to pay** sets status **`Payment_Pending`**.
4. **`/payment/:id`** — Razorpay Checkout; on success, **`POST /payment/verify`** marks **`Paid`**.
5. Admin assigns a **CA** to the ITR → status **`Under_Review`** (when it was `Paid`).
6. CA verifies documents and moves status to **`Verified`**, then **`Filed`**.

**Dev note:** `client/src/proxy.conf.json` proxies **`/uploads`** to the API so document links resolve during `ng serve`.

## Tax engine

Implemented in `server/src/utils/taxCalculator.ts`:

- Old / new regime slabs (simplified AY 2024–25 style)
- Section **87A** rebate (old: taxable ≤ ₹5L; new: full rebate when taxable ≤ ₹7L in this model)
- **4% cess** on tax after rebate

## Sample API requests

Replace `TOKEN`, IDs, and host as needed.

### Create ITR (USER)

```http
POST /api/v1/itr HTTP/1.1
Authorization: Bearer TOKEN
Content-Type: application/json

{"assessmentYear":"2025-26","2024-25","financialYear":"2023-24","regime":"NEW"}
```

### Patch draft (USER)

```http
PATCH /api/v1/itr/ITR_ID HTTP/1.1
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "personalInfo": {
    "firstName": "Rahul",
    "lastName": "Sharma",
    "pan": "ABCDE1234F",
    "mobile": "9876543210",
    "email": "rahul@example.com"
  },
  "income": { "salary": 800000, "business": 0, "capitalGains": 0, "otherIncome": 0 },
  "deductions": { "c80C": 150000, "c80D": 25000, "c80E": 0, "c80G": 0, "nps": 0 }
}
```

### Calculate tax (USER)

```http
POST /api/v1/itr/ITR_ID/calculate HTTP/1.1
Authorization: Bearer TOKEN
```

### Submit for payment (USER)

```http
POST /api/v1/itr/ITR_ID/submit-for-payment HTTP/1.1
Authorization: Bearer TOKEN
```

### Upload document (USER)

```bash
curl -X POST http://localhost:3000/api/v1/documents/itr/ITR_ID \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@Form16.pdf" \
  -F "type=Form16"
```

### Create Razorpay order (USER)

```http
POST /api/v1/payment/create-order HTTP/1.1
Authorization: Bearer TOKEN
Content-Type: application/json

{"itrId":"ITR_ID"}
```

Response includes `keyId`, `orderId`, `amount` (paise), `currency`.

### Verify payment (USER)

```http
POST /api/v1/payment/verify HTTP/1.1
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "itrId": "ITR_ID",
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_from_checkout"
}
```

### Admin: stats & assign CA

```http
GET /api/v1/admin/stats HTTP/1.1
Authorization: Bearer ADMIN_TOKEN
```

```http
PATCH /api/v1/admin/itr/ITR_ID/assign-ca HTTP/1.1
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{"caUserId":"CA_USER_OBJECT_ID"}
```

### CA: verify document

```http
PATCH /api/v1/ca/itr/ITR_ID/documents/DOC_SUBDOC_ID HTTP/1.1
Authorization: Bearer CA_TOKEN
Content-Type: application/json

{"status":"Verified","remarks":"Form 16 matches declared salary"}
```

### CA: mark filed

```http
PATCH /api/v1/ca/itr/ITR_ID/status HTTP/1.1
Authorization: Bearer CA_TOKEN
Content-Type: application/json

{"status":"Filed","caRemarks":"Ack filed with CPC"}
```

(`Verified` requires no **Pending** documents and no **Rejected** documents.)

## Frontend routes

| Route | Guard | Description |
|--------|--------|-------------|
| `/itr` | auth + USER | Filing list |
| `/itr/:id` | auth + USER | Wizard |
| `/payment/:id` | auth + USER | Razorpay |
| `/ca` | auth + CA | CA workspace |
| `/admin` | auth + ADMIN | Admin panel |

## Production checklist

- Set `RAZORPAY_*` to **live** keys and HTTPS origin in Razorpay dashboard.
- Serve the API and static `/uploads` over HTTPS; configure **CORS** (`CORS_ORIGIN`) for your Angular origin.
- Ensure `uploads/itr-docs` is on persistent storage (not ephemeral disk).
- Treat tax figures as **indicative** until you plug in audited slab data for each AY.
