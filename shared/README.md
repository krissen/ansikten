# Shared Types and Schemas

This directory contains shared type definitions and JSON schemas used by both frontend and backend.

## Contents

- `schemas/` - JSON Schema files generated from Pydantic models
- `shared_types.py` - Python type definitions (legacy, use Pydantic models instead)
- `shared_types.ts` - TypeScript type definitions (reference)
- `generate_schemas.py` - Script to regenerate JSON schemas

## JSON Schemas

The `schemas/` directory contains JSON Schema files for all API request/response types.
These are auto-generated from the backend Pydantic models.

### Regenerating Schemas

When API models change, regenerate schemas:

```bash
cd backend
/path/to/python ../shared/generate_schemas.py
```

Or with the project's conda environment:

```bash
cd backend
~/.local/share/miniforge3/envs/hitta_ansikten/bin/python ../shared/generate_schemas.py
```

### Using Schemas

**Python (Pydantic):** Use the models directly from `backend/api/routes/`

**JavaScript:** Use schemas for validation with libraries like Ajv:

```javascript
import Ajv from 'ajv';
import detectedFaceSchema from '../shared/schemas/DetectedFace.json';

const ajv = new Ajv();
const validate = ajv.compile(detectedFaceSchema);

if (!validate(data)) {
  console.error('Invalid DetectedFace:', validate.errors);
}
```

## Key Types

| Type | Description |
|------|-------------|
| `BoundingBox` | Face location coordinates (x, y, width, height) |
| `DetectedFace` | Complete face detection result |
| `MatchAlternative` | Alternative person matches |
| `DetectionResult` | Full detection API response |
| `DatabaseState` | Database snapshot |
| `RenameConfig` | File rename configuration |

## Adding New Types

1. Define the Pydantic model in `backend/api/routes/`
2. Add it to `generate_schemas.py`
3. Run the generation script
4. Commit the new schema file
