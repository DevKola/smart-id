from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware  # Added import
from ultralytics import YOLO
import cv2
import numpy as np
import json

app = FastAPI()

# --- CRITICAL ADDITION ---
# This allows your React Native Android app to talk to the server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)
# -------------------------

model = YOLO('yolov8n.pt')

with open('database.json', 'r') as f:
    item_database = json.load(f)

@app.post("/scan/")
async def scan_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        # Optimized to frombuffer to prevent terminal warnings
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        results = model.predict(img)
        
        found_items = []
        
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                label = model.names[class_id]
                confidence = float(box.conf[0])
                
                if confidence > 0.5:
                     found_items.append(label)

        if not found_items:
             return {"status": "success", "message": "No items recognized", "data": None}

        primary_item = found_items[0]
        item_info = item_database.get(primary_item.lower())

        if item_info:
            return {
                "status": "success",
                "detected": primary_item,
                "information": item_info
            }
        else:
             return {
                "status": "success",
                "detected": primary_item,
                "information": "Item detected, but no detailed information found in database."
             }

    except Exception as e:
        return {"status": "error", "message": str(e)}