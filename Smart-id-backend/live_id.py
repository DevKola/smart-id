import cv2
from ultralytics import YOLO

model = YOLO('yolov8n.pt')

cap = cv2.VideoCapture(0)

while cap.isOpened():
    success, frame = cap.read()

    if success:
        results = model(frame, stream=True)

        for r in results:
            annotated_frame = r.plot()

        cv2.imshow("Smart ID System - Live", annotated_frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    else:
        break

# Cleanup
cap.release()
cv2.destroyAllWindows()