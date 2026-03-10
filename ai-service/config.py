import os

# Configuration for AI service
class Config:
    PORT = int(os.getenv('PORT', 5000))
    STORAGE_DIR = os.getenv('STORAGE_DIR', '../backend/storage')
    WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'base')  # tiny, base, small, medium, large
    # Maximum concurrent Whisper jobs (1 = sequential processing, safest)
    MAX_CONCURRENT_JOBS = int(os.getenv('MAX_CONCURRENT_JOBS', 1))

config = Config()
