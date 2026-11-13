# Сборка фронтенда
FROM node:24-bookworm-slim AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# Запуск бэкенда и собранного сайта
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY migrations/ migrations/
COPY alembic.ini ./

COPY --from=frontend-build /build/frontend/dist/ frontend/dist/

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "python -m alembic upgrade head && exec uvicorn backend.main:app --host 0.0.0.0 --port 8000"]