import { Response } from 'express';
import { AuthedRequest } from '../auth/auth';
import { itrService } from '../itr/itr.service';

const DOC_TYPES = ['Form16', 'BankStatement', 'PAN', 'Aadhaar', 'InvestmentProof', 'Other'] as const;

export async function uploadForItr(req: AuthedRequest, res: Response) {
  try {
    const userId = String(req.user!.userId);
    const { itrId } = req.params;
    const typeRaw = (req.body?.type as string) || 'Other';
    const type = DOC_TYPES.includes(typeRaw as any) ? typeRaw : 'Other';

    const file = req.file;
    if (!file) return res.status(400).json({ message: 'File required' });

    const itr = await itrService.addDocument(itrId, userId, file.path, file.originalname, type);
    if (!itr) return res.status(404).json({ message: 'ITR not found' });
    res.status(201).json({ itr });
  } catch (e: any) {
    if (e?.message === 'NOT_UPLOADABLE') {
      return res.status(400).json({ message: 'Documents cannot be uploaded for this ITR status' });
    }
    res.status(500).json({ message: e?.message || 'Upload failed' });
  }
}
