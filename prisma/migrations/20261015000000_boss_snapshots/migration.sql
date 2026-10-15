-- CreateTable
CREATE TABLE "boss_snapshots" (
    "character_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boss_snapshots_pkey" PRIMARY KEY ("character_id","date")
);

-- AddForeignKey
ALTER TABLE "boss_snapshots" ADD CONSTRAINT "boss_snapshots_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
