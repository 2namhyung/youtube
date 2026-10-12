import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run("apps.api.main:create_app", factory=True, host="127.0.0.1", port=int(os.environ.get("SHOPPING_PORT", "8765")), workers=1)
