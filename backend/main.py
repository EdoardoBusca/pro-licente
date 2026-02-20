from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import pandas as pd
import io
from engine import train_logic 

app = FastAPI()

@app.post("/train")
async def train(file: UploadFile = File(...), target: str = Form(...), horizon: int = Form(30)):
    try:
        contents = await file.read()
        if not contents:
            raise ValueError("Uploaded file is empty.")
        
        # PRO IMPROVEMENT: Auto-detect separator and encoding
        try:
            # We use sep=None and engine='python' to let pandas guess if it's , or ;
            df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python', encoding_errors='replace')
        except:
            # Fallback for Excel files
            df = pd.read_excel(io.BytesIO(contents))

        # Clean column names (remove hidden spaces for matching)
        df.columns = df.columns.str.strip()
        
        # Run the updated robust logic
        result = train_logic(df, target.strip(), horizon)
        
        return {
            "winner": result["winner"],
            "accuracy": f"{result['score']:.2%}",
            "leaderboard": result["leaderboard"],
            "projection": result["projection"]
        }
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Data Error: {str(e)}")
    except Exception as e:
        # Returns the specific error message to the user instead of just crashing
        raise HTTPException(status_code=500, detail=f"Data Error: {str(e)}")