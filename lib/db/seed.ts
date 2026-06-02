import { db, getMeta, setMeta } from "@/lib/db/schema";
import { addBacklog, addIdea, addProject, addTask } from "@/lib/db/queries";
import { localDateKey } from "@/lib/date";

/**
 * First-run seed using real captured items so the app feels alive immediately.
 * Idempotent: runs only once, and never if data already exists.
 */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await getMeta("seeded", false);
  if (seeded) return;

  if ((await db.projects.count()) > 0) {
    await setMeta("seeded", true);
    return;
  }

  const hkn = await addProject("HKN", "active");
  const dei = await addProject("Dei Verbum", "active");
  await addProject("Money Tracker", "active");
  await addProject("Account Hub", "active");
  await addProject("EVD", "active");
  const rutina = await addProject("Rutina", "area");
  const uni = await addProject("Uni", "area");
  const trabajo = await addProject("Trabajo", "area");

  await addTask({ title: "Actualizar el abrazo", projectId: hkn, bucket: "today" });
  await addTask({ title: "Ajustes", projectId: dei, bucket: "today" });
  await addTask({ title: "Terminar cosas de la U", projectId: uni, bucket: "today" });
  await addTask({ title: "Ropa", projectId: rutina, bucket: "today" });

  await addTask({
    title: "Revisar ticket",
    links: ["https://simetrikinc.atlassian.net/browse/BUGS-4682"],
    projectId: trabajo,
    bucket: "tomorrow",
  });

  await addTask({ title: "Unificar itinerario de viaje (más visible)", bucket: "week" });
  await addTask({ title: "Revisar scroll dinámico (capturar bpm)", projectId: hkn, bucket: "week" });
  await addTask({
    title: "Ajustar canciones mainstream",
    links: ["https://open.spotify.com/playlist/4pSPYorneCktovJGsoC6bi"],
    projectId: hkn,
    bucket: "week",
  });

  const deiIdeas = [
    "Highlight del en vivo cuando YouTube esté en directo en el home",
    "CTA directo a las lecturas",
    "Organizar calendario de actividades parroquiales desde no-code",
    "Arreglar embedding de redes en el home",
    "Botón flotante en lecturas sin CTA",
    "Arreglar fondos de fotos de iconos de comunidades",
    "Agregar página de oraciones",
    "Suavizar colores (no tanto blanco)",
  ];
  for (const text of deiIdeas) await addIdea(dei, text);

  const backlog = [
    "Ollama",
    "OpenClaw",
    "Videogame agent",
    "Motos 3D Tron",
    "Air Hockey Online",
    "Infinito anti estrés",
    "Claude Certified",
    "Cursos de Ciberseguridad",
  ];
  for (const title of backlog) await addBacklog(title);

  // Seed counts as today's first open — prevents the rollover from
  // immediately flagging freshly seeded tasks as "carried".
  await setMeta("lastOpenedDay", localDateKey());
  await setMeta("seeded", true);
}
