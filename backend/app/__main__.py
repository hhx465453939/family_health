import uvicorn

from app.core.config import settings


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
    )


if __name__ == "__main__":
    main()
