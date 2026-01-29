import os

# Configuration for AI service
class Config:
    PORT = int(os.getenv('PORT', 5000))
    STORAGE_DIR = os.getenv('STORAGE_DIR', '../backend/storage')
    WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'base')  # tiny, base, small, medium, large
    
config = Config()
