-- CreateTable
CREATE TABLE "schedule_weekly_overrides" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT,
    "classId" TEXT,
    "teacherId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "roomId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_weekly_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_weekly_overrides_scheduleId_weekStart_key" ON "schedule_weekly_overrides"("scheduleId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_weekly_overrides_roomId_timeSlotId_weekStart_key" ON "schedule_weekly_overrides"("roomId", "timeSlotId", "weekStart");

-- AddForeignKey
ALTER TABLE "schedule_weekly_overrides" ADD CONSTRAINT "schedule_weekly_overrides_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_weekly_overrides" ADD CONSTRAINT "schedule_weekly_overrides_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_weekly_overrides" ADD CONSTRAINT "schedule_weekly_overrides_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_weekly_overrides" ADD CONSTRAINT "schedule_weekly_overrides_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_weekly_overrides" ADD CONSTRAINT "schedule_weekly_overrides_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
