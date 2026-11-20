import { serializeSchedule } from "./validation.js";

const WEEKDAY_NAMES = {
  Monday: "MONDAY",
  Tuesday: "TUESDAY",
  Wednesday: "WEDNESDAY",
  Thursday: "THURSDAY",
  Friday: "FRIDAY",
  Saturday: "SATURDAY",
  Sunday: "SUNDAY",
};

export function doctorInclude() {
  return {
    department: { select: { id: true, name: true, status: true } },
    schedules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
  };
}

export function doctorResponse(doctor) {
  const hospitalWeekday = WEEKDAY_NAMES[
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }).format(new Date())
  ];
  const schedules = doctor.schedules.map(serializeSchedule);
  return {
    id: doctor.id,
    departmentId: doctor.departmentId,
    department: doctor.department,
    name: doctor.name,
    photoUrl: doctor.photoUrl,
    qualification: doctor.qualification,
    specialization: doctor.specialization,
    experienceYears: doctor.experienceYears,
    consultationFee: doctor.consultationFee.toFixed(2),
    status: doctor.status,
    schedules,
    availableToday: doctor.status === "ACTIVE"
      && doctor.department.status === "ACTIVE"
      && schedules.some((schedule) => schedule.weekday === hospitalWeekday && schedule.isActive),
    createdAt: doctor.createdAt,
    updatedAt: doctor.updatedAt,
  };
}
