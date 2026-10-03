-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ocid" TEXT,
    "world" TEXT,
    "class_name" TEXT,
    "level" INTEGER,
    "image" TEXT,
    "memo" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "boss_state" JSONB,
    "synced_at" TIMESTAMP(3),
    "boss_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boss_settings" (
    "character_id" TEXT NOT NULL,
    "boss" TEXT NOT NULL,
    "difficulty" TEXT,
    "party_size" INTEGER NOT NULL DEFAULT 1,
    "added" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boss_settings_pkey" PRIMARY KEY ("character_id","boss")
);

-- CreateTable
CREATE TABLE "boss_clears" (
    "character_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "boss" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "party_size" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "cleared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_clears_pkey" PRIMARY KEY ("character_id","period","boss")
);

-- CreateTable
CREATE TABLE "hunt_records" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "day" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hunt_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunt_evidence" (
    "id" TEXT NOT NULL,
    "hunt_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image" BYTEA NOT NULL,

    CONSTRAINT "hunt_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunt_imports" (
    "legacy_character_id" TEXT NOT NULL,
    "legacy_name" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "records" INTEGER NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hunt_imports_pkey" PRIMARY KEY ("legacy_character_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key" ON "accounts"("username");

-- CreateIndex
CREATE INDEX "characters_account_id_position_idx" ON "characters"("account_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "characters_account_id_name_key" ON "characters"("account_id", "name");

-- CreateIndex
CREATE INDEX "boss_clears_period_idx" ON "boss_clears"("period");

-- CreateIndex
CREATE INDEX "hunt_records_character_id_started_at_idx" ON "hunt_records"("character_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "hunt_evidence_hunt_id_kind_captured_at_idx" ON "hunt_evidence"("hunt_id", "kind", "captured_at" DESC);

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_settings" ADD CONSTRAINT "boss_settings_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunt_records" ADD CONSTRAINT "hunt_records_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunt_evidence" ADD CONSTRAINT "hunt_evidence_hunt_id_fkey" FOREIGN KEY ("hunt_id") REFERENCES "hunt_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

