# Phase 1 Seed Accounts (Visible Credentials)

These are **test/staging credentials only**. Do **not** use in production.

Default test password policy for all listed accounts:
- workers: `Worker123!`
- customers: `Customer123!`
- admin: `Admin123!`

## Platform Admin (1)

| Role | Name | Email | Password |
|------|------|-------|----------|
| admin | Super Admin | `admin@workerzpk.com` | `Admin123!` |

## Workers (10)

| Role | Name | Email | Password | Primary Skill |
|------|------|-------|----------|---------------|
| worker | Ali Raza | `worker1@workerzpk.com` | `Worker123!` | Plumbing |
| worker | Ahmed Khan | `worker2@workerzpk.com` | `Worker123!` | Electrical |
| worker | Bilal Tariq | `worker3@workerzpk.com` | `Worker123!` | AC Service |
| worker | Usman Javed | `worker4@workerzpk.com` | `Worker123!` | Cleaning |
| worker | Hamza Iqbal | `worker5@workerzpk.com` | `Worker123!` | Handyman |
| worker | Danish Noor | `worker6@workerzpk.com` | `Worker123!` | Painting |
| worker | Kashif Malik | `worker7@workerzpk.com` | `Worker123!` | Carpentry |
| worker | Saad Hassan | `worker8@workerzpk.com` | `Worker123!` | Tiling |
| worker | Faisal Shah | `worker9@workerzpk.com` | `Worker123!` | Appliance Repair |
| worker | Imran Latif | `worker10@workerzpk.com` | `Worker123!` | Roofing |

## Customers (20)

| Role | Name | Email | Password |
|------|------|-------|----------|
| customer | Customer 01 | `customer1@workerzpk.com` | `Customer123!` |
| customer | Customer 02 | `customer2@workerzpk.com` | `Customer123!` |
| customer | Customer 03 | `customer3@workerzpk.com` | `Customer123!` |
| customer | Customer 04 | `customer4@workerzpk.com` | `Customer123!` |
| customer | Customer 05 | `customer5@workerzpk.com` | `Customer123!` |
| customer | Customer 06 | `customer6@workerzpk.com` | `Customer123!` |
| customer | Customer 07 | `customer7@workerzpk.com` | `Customer123!` |
| customer | Customer 08 | `customer8@workerzpk.com` | `Customer123!` |
| customer | Customer 09 | `customer9@workerzpk.com` | `Customer123!` |
| customer | Customer 10 | `customer10@workerzpk.com` | `Customer123!` |
| customer | Customer 11 | `customer11@workerzpk.com` | `Customer123!` |
| customer | Customer 12 | `customer12@workerzpk.com` | `Customer123!` |
| customer | Customer 13 | `customer13@workerzpk.com` | `Customer123!` |
| customer | Customer 14 | `customer14@workerzpk.com` | `Customer123!` |
| customer | Customer 15 | `customer15@workerzpk.com` | `Customer123!` |
| customer | Customer 16 | `customer16@workerzpk.com` | `Customer123!` |
| customer | Customer 17 | `customer17@workerzpk.com` | `Customer123!` |
| customer | Customer 18 | `customer18@workerzpk.com` | `Customer123!` |
| customer | Customer 19 | `customer19@workerzpk.com` | `Customer123!` |
| customer | Customer 20 | `customer20@workerzpk.com` | `Customer123!` |

## Setup steps

1. In Supabase Dashboard open **Authentication -> Users -> Add user**.
2. Create users using emails/passwords above.
3. Run SQL file `docs/seed-data/phase1-domain-seed.sql` in SQL Editor to assign roles, worker profiles, listings, and sample jobs.

