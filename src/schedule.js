"use strict";

const TZ = "America/Argentina/Buenos_Aires";

function ahora() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

/**
 * Devuelve true si estamos dentro del horario de atención.
 * Lunes a Viernes, hora configurable por variables de entorno.
 */
function isOpen() {
  const now  = ahora();
  const dia  = now.getDay();   // 0=Dom, 6=Sab
  const hora = now.getHours();

  const inicio = parseInt(process.env.HORA_INICIO || "9",  10);
  const fin    = parseInt(process.env.HORA_FIN    || "18", 10);

  const esHabil = dia >= 1 && dia <= 5;
  const enHora  = hora >= inicio && hora < fin;

  return esHabil && enHora;
}

/**
 * Mensaje para cuando llega un mensaje fuera de horario.
 */
function closedMsg(nombre) {
  const n = nombre && nombre !== "Cliente" ? ` ${nombre.split(" ")[0]}` : "";
  return (
    `Hola${n}! 😊 Gracias por escribirnos.\n\n` +
    `En este momento estamos fuera del horario de atención (Lunes a Viernes de 9 a 18 hs).\n\n` +
    `Dejanos tu:\n` +
    `- Nombre completo\n` +
    `- Barrio y número de lote\n` +
    `- Consulta\n\n` +
    `Y te respondemos en cuanto retomemos. ¡Gracias!`
  );
}

module.exports = { isOpen, closedMsg };
