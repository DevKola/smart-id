from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import cv2
import numpy as np
import json
import asyncio
import base64
import os

app = FastAPI(title="Smart ID Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use ONNX model if available (3x faster than PyTorch on CPU-only servers like Render free tier)
# To generate: run `python export_model.py` once locally, then commit yolov8n.onnx to git
ONNX_PATH = "yolov8n.onnx"
PT_PATH   = "yolov8n.pt"

if os.path.exists(ONNX_PATH):
    print(f"✅ Loading ONNX model ({ONNX_PATH}) — faster CPU inference")
    model = YOLO(ONNX_PATH)
else:
    print(f"⚠️  ONNX model not found, falling back to PyTorch ({PT_PATH})")
    model = YOLO(PT_PATH)  # ultralytics will auto-download if missing

# Image size for inference — 320 is 4x faster than 640 on weak CPUs with minor accuracy loss
INFER_SIZE = 320

with open('database.json', 'r') as f:
    item_database = json.load(f)

def process_frame(contents: bytes):
    try:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
             return {"status": "error", "message": "Failed to decode image"}

        # Run prediction
        # verbose=False to keep the terminal output clean on every frame
        results = model.predict(img, verbose=False, imgsz=INFER_SIZE)
        
        found_items = []
        
        for result in results:
            for box in result.boxes:
                confidence = float(box.conf[0])
                # Lowered the confidence threshold to 25% to catch more items
                if confidence > 0.25:
                    class_id = int(box.cls[0])
                    label = model.names[class_id]
                    # Normalized coordinates [x_min, y_min, x_max, y_max] from 0.0 to 1.0
                    # This makes it easy for the frontend to draw bounding boxes regardless of screen size
                    x1, y1, x2, y2 = box.xyxyn[0].tolist()
                    
                    found_items.append({
                        "label": label,
                        "confidence": confidence,
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
                    })

        if not found_items:
             return {"status": "success", "message": "No items recognized", "data": []}

        # For the slide-up modal, we provide detailed info for the most confident / primary item
        primary_item = found_items[0]["label"]
        item_info = item_database.get(primary_item.lower())

        return {
            "status": "success",
            "detected": primary_item,
            "information": item_info if item_info else "Item detected, but no detailed information found in database.",
            "data": found_items
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.websocket("/ws/scan")
async def websocket_scan(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive Base64 string from React Native
            data_text = await websocket.receive_text()
            
            # Decode Base64 to binary bytes
            data = base64.b64decode(data_text)
            
            # Offload heavy YOLO processing to a background thread
            # so the FastAPI async event loop is not blocked
            response = await asyncio.to_thread(process_frame, data)
            
            # Send results back
            await websocket.send_json(response)
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

# Keep the old POST endpoint for testing/fallback
@app.post("/scan/")
async def scan_image(file: UploadFile = File(...)):
    contents = await file.read()
    response = await asyncio.to_thread(process_frame, contents)
    return response