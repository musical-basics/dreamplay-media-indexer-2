import { NextRequest, NextResponse } from 'next/server';
import { getAllAssetsByIds } from '@/lib/db';
import { generateDaVinciXML } from '@/lib/exporters/davinci-xml';
import { generateFCPXML } from '@/lib/exporters/fcpxml';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, format = 'davinci', timelineName = 'DreamPlay Timeline' } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No asset IDs provided' }, { status: 400 });
    }

    const assets = await getAllAssetsByIds(ids);

    let content: string;
    let filename: string;
    let contentType: string;

    if (format === 'fcpxml') {
      content = generateFCPXML(assets, 'DreamPlay Library', timelineName);
      filename = `${timelineName.replace(/\s+/g, '_')}.fcpxml`;
      contentType = 'application/xml';
    } else {
      content = generateDaVinciXML(assets, timelineName);
      filename = `${timelineName.replace(/\s+/g, '_')}.xml`;
      contentType = 'application/xml';
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[API /export] Error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
