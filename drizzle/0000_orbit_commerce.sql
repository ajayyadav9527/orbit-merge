CREATE TABLE accounts (user_id INTEGER PRIMARY KEY, undos INTEGER NOT NULL DEFAULT 0 CHECK(undos>=0), rescues INTEGER NOT NULL DEFAULT 0 CHECK(rescues>=0));
--> statement-breakpoint
CREATE TABLE orders (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, product TEXT NOT NULL, amount INTEGER NOT NULL, created INTEGER NOT NULL, paid INTEGER NOT NULL DEFAULT 0, charge TEXT UNIQUE);
--> statement-breakpoint
CREATE INDEX orders_user ON orders(user_id);
--> statement-breakpoint
CREATE TABLE consumptions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE support_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, update_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
