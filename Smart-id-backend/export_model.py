"""
Run this ONCE locally to generate yolov8n.onnx, then commit it to git.
ONNX runs ~3x faster than PyTorch on CPU-only servers.

Usage:
    cd Smart-id-backend
    source venv/bin/activate
    python export_model.py
"""
from ultralytics import YOLO

print("Exporting YOLOv8n to ONNX format...")
model = YOLO("yolov8n.pt")

# Export to ONNX — optimised for CPU inference
model.export(format="onnx", imgsz=320, simplify=True, opset=12)

print("✅ Done! yolov8n.onnx has been created.")
print("   Now commit it to git and redeploy.")
print("   git add yolov8n.onnx && git commit -m 'perf: add ONNX model for faster CPU inference'")
