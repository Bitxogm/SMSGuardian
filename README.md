# 🛡️ SMSGuardian
> **Tu escudo inteligente contra el fraude SMS, Smishing y Spam.**

SMSGuardian es una aplicación de seguridad avanzada para Android construida con **React Native**. Su misión es interceptar, analizar y bloquear mensajes SMS maliciosos antes de que el usuario pueda caer en estafas, protegiendo su privacidad y seguridad financiera.

---

## 🚀 Características Principales

### 1. 🧠 Análisis Híbrido de Amenazas (Hybrid Threat Engine)
Nuestro motor de análisis (`SMSAnalysisService` y `URLThreatAnalyzer`) combina lo mejor de dos mundos para equilibrar privacidad y seguridad:

*   **🟢 Fase 1: Whitelist Local (Privacidad Total)**
    *   Validación instantánea de dominios oficiales bancarios y de servicios (Google, PayPal, Santander, Hacienda, etc.).
    *   **Beneficio**: Tus mensajes seguros NO salen de tu dispositivo.

*   **🟡 Fase 2: Heurística Avanzada y Vishing (Offline)**
    *   **Vishing Detection**: Extrae y analiza números de teléfono sospechosos dentro del texto del mensaje.
    *   **Optimización Regional**: Patrones específicos para el mercado español (Bancos, Logística como Correos/Seur, y la estafas de la "familia").
    *   **Detección de Phishing**: Bloquea acortadores de riesgo (`bit.ly`, `t.xyz`) y TLDs sospechosos.
    *   **Análisis Psicológico**: Detecta lenguaje de urgencia y manipulación emocional.

*   **🔴 Fase 3: Reputation & Cloud Verification (API)**
    *   Consulta asíncrona de la reputación de los números remitentes y de los números citados en el cuerpo.
    *   Si una URL es sospechosa, consultamos en tiempo real con **VirusTotal** y **Google Safe Browsing**.


### 2. ☣️ Cuarentena Inteligente
*   Los mensajes peligrosos **NUNCA** llegan a tu bandeja de entrada principal.
*   Se aíslan en una "Bóveda de Cuarentena" donde puedes revisarlos de forma segura.
*   **Modo de Prueba**: Incluye un simulador para verificar que el sistema detecta malware real.

### 3. 📩 Bandeja de Entrada Segura
*   Gestor SMS completo y moderno.
*   Posibilidad de mover mensajes sospechosos manualmente a cuarentena para su análisis.
*   Sistema de notificaciones que respeta tu atención.

### 4. 🤖 Asistente de Seguridad con IA (Gemini) [NUEVO]
*   **Análisis Conversacional**: ¿Tienes dudas sobre un mensaje? Chatea con nuestra IA integrada (Google Gemini) para entender por qué un SMS es sospechoso.
*   **Explicaciones Claras**: En lugar de solo decir "es peligroso", el asistente te explica las señales de alerta (urgencia, enlaces extraños, remitente desconocido).
*   **Privacidad Controlada**: Tú decides qué mensajes compartir con la IA. Solo se envía el contenido del SMS seleccionado al pulsar el botón de análisis.

### 5. 📋 Gestión de Listas
*   **Lista Blanca (Whitelist)**: Sincronización automática con tus contactos para garantizar que los mensajes de amigos/familia siempre lleguen.
*   **Lista Negra (Blacklist)**: Bloqueo persistente de remitentes molestos.

---

## 🛠️ Stack Tecnológico

*   **Core**: React Native 0.81 (Architecture: New Architecture enabled).
*   **Storage**: SQLite (react-native-sqlite-storage) para persistencia segura y rápida.
*   **Native Modules**: Módulos Android nativos (Java/Kotlin) para interceptación de SMS en segundo plano (`SMSReceiver`, `HeadlessJS`).
*   **Security & AI**: Integración con APIs de Ciberseguridad (VirusTotal, Google Safe Browsing) y Google Generative AI (Gemini).

---

## ⚡ Comandos Útiles

### Instalación y Compilación
```bash
# Instalar dependencias
npm install

# Compilar y lanzar en Android (Emulador o Dispositivo)
npm run android

# Compilar una Release Test (APK firmado para pruebas)
./build-fresh.sh
```

### 🧪 Calidad y Testing
El proyecto cuenta con una suite de pruebas automatizadas para garantizar la fiabilidad del motor de detección.

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests con cobertura
npm test -- --coverage
```


### ⚙️ Configuración del Entorno (API Keys)

Para que el análisis híbrido funcione al 100% (Consulta a VirusTotal y Google), necesitas configurar tus claves de API.

1.  Crea el archivo `src/config/env.ts` (puedes usar `env.example.ts` como base si existe, o crear uno nuevo).
2.  Añade tus claves personales:

```typescript
// src/config/env.ts
export const API_KEYS = {
  virusTotal: 'TU_CLAVE_DE_VIRUSTOTAL_AQUI', 
  safeBrowsing: 'TU_CLAVE_DE_GOOGLE_SAFE_BROWSING_AQUI',
  gemini: 'TU_CLAVE_DE_GOOGLE_GEMINI_AQUI', // Requerido para el asistente de IA
  phishTank: 'TU_CLAVE_DE_PHISHTANK_AQUI' // Opcional
};
```

> **Nota**: El proyecto funcionará sin estas claves, pero el análisis se limitará a la detección local offline (Listas blancas y patrones).

### Verificación de Seguridad
Para probar el motor de análisis:
1.  Abre la app y ve a la pestaña **Cuarentena**.
2.  Si la lista está vacía, se inyectarán automáticamente 3 mensajes de prueba al pulsar el botón **"⚡ TEST"**.
3.  Pulsa el botón **"🔍 Escanear"** en cualquiera de ellos para ver el motor híbrido en acción.
4.  Toca el mensaje para abrir los detalles y pulsa **"🧠 Analizar con Gemini AI"** para probar el asistente.

---

## 🔒 Privacidad
SMSGuardian está diseñado bajo el principio de **Privacidad por Diseño**.
*   Los SMS se procesan localmente en el dispositivo.
*   Solo se envían hashes de URLs anonimizados a los servicios de nube (VirusTotal/Google) cuando es estrictamente necesario para confirmar una amenaza grave.
*   Tus datos personales nunca se comparten con terceros.

---

---

## 🤝 Contribuciones (Open Source)

¡Las contribuciones son bienvenidas! SMSGuardian es un proyecto de código abierto y nos encantaría contar con tu ayuda para hacerlo aún más seguro.

El proyecto está diseñado para ser compatible con **F-Droid** y tiendas éticas como **Aurora Store**.

### ¿Cómo contribuir?
1.  Haz un **Fork** del repositorio.
2.  Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`).
3.  Haz tus cambios y commits (`git commit -m 'Add some AmazingFeature'`).
4.  Push a la rama (`git push origin feature/AmazingFeature`).
5.  Abre un **Pull Request**.

Si encuentras un bug o tienes una idea de seguridad, por favor abre un [Issue](https://github.com/Bitxogm/SMSGuardian/issues) para discutirlo.

---

## 📜 Licencia

Distribuido bajo la **Licencia MIT**. Esto significa que puedes usarlo, modificarlo y distribuirlo libremente, siempre que se mantenga la atribución al autor original.
Consulta el archivo `LICENSE` para más información.

---

## 👨‍💻 Autor y Comunidad

**SMSGuardian Team** - Desarrollado con ❤️ y paranoia por la seguridad.

*   **GitHub**: [Bitxogm](https://github.com/Bitxogm)
*   **Repositorio**: [https://github.com/Bitxogm/SMSGuardian](https://github.com/Bitxogm/SMSGuardian)

---

**© 2025 SMSGuardian Project**
*Protegiendo tus mensajes, un bit a la vez.*
