
from ultralytics import YOLO

model = YOLO('yolov8n.pt') 

results = model.predict(source='bus.jpg', save=True)

print("AI is finished! Look for a new folder called 'runs' in your sidebar.")