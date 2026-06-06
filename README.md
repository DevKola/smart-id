# Smart ID System 🧠📱

An AI-powered React Native mobile application paired with a local Python/FastAPI backend. The system utilizes a state-of-the-art YOLOv8 object detection model to scan, recognize, and instantly pull detailed database information about physical objects in real-time.

---

## ⚙️ How it Works (Step-by-Step)

1. **Initialization:** The React Native mobile app boots up and immediately attempts to establish a connection with the local Python FastAPI backend.
2. **Dynamic Routing:** Under the hood, the app automatically detects your platform. It routes network requests to `localhost` for iOS Simulators and `10.0.2.2` for Android Emulators to bypass local networking restrictions.
3. **Capture & Upload:** 
   - Users can use the live camera feed (on physical devices) to stream frames over a lightning-fast WebSocket.
   - Or, users can enter **Test Mode** (ideal for Simulators/Emulators) to upload an image from the device gallery via a traditional HTTP POST request.
4. **AI Inference:** The FastAPI backend receives the image buffer, decodes it using OpenCV, and passes it through a pre-trained **YOLOv8 Nano (`yolov8n.pt`)** model.
5. **Database Cross-Referencing:** The AI detects bounding boxes and object classes. It extracts the primary object and searches the `database.json` file for matching metadata (descriptions, safety warnings, and categories).
6. **Sleek UI Delivery:** The backend returns the aggregated data to the mobile app, which triggers a smooth, native bottom-sheet animation to display the results to the user. If nothing is recognized, it displays a fallback "NO OBJECT FOUND" state.

---

## 🚀 How to Start the Project

You must start **both** the Backend and the Frontend in two separate terminal windows for the app to function.

### 1. Start the Python AI Backend
Open a new terminal window and run the following commands:
```bash
# Navigate to the backend directory
cd path/to/smart-id-system/Smart-id-backend

# Activate the virtual environment
source venv/bin/activate

# Start the FastAPI server on port 8000
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*Wait until you see `Application startup complete.` before launching the mobile app.*

---

### 2. Start the Mobile Frontend

Open a **second** terminal window.

#### 🍏 For iOS (Mac Only)
```bash
# Navigate to the mobile directory
cd path/to/smart-id-system/SmartIDMobile

# Start the Metro bundler and build the iOS app
npm run ios
```
*This will automatically launch the default iOS Simulator (e.g., iPhone 15 Pro) and install the app.*

#### 🤖 For Android
1. Open **Android Studio** and launch an Android Virtual Device (AVD) from the Device Manager.
2. Once the emulator has booted to the home screen, run:
```bash
# Navigate to the mobile directory
cd path/to/smart-id-system/SmartIDMobile

# Start the Metro bundler and build the Android app
npm run android
```

---

## 🛠 Troubleshooting

- **"Network Request Failed" / "WebSocket Disconnected":** Ensure your Python backend is actively running. If you are on an Android emulator, ensure you haven't altered the `10.0.2.2` routing logic in `App.tsx`.
- **"No items recognized":** The default YOLOv8 model only recognizes 80 common objects (like laptops, cell phones, cups, people, cars). It will not recognize custom items like ID Cards without a custom-trained `.pt` weights file.
- **Android `EACCES` Gradle Error:** Run `chmod +x android/gradlew` inside the `SmartIDMobile` folder.
- **Android `app:installDebug FAILED` Error:** This happens when the emulator's storage gets corrupted or runs out of space. Open Android Studio Device Manager and click **"Wipe Data"** on your emulator.
