function parseMOICSV(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];

        const encoding = detectCSVEncoding(buffer);
        console.log(`🧾 CSV 編碼判斷：${encoding}`);

        let decodedText;

        if (encoding === 'big5') {
            decodedText = iconv.decode(buffer, 'big5');
        } else {
            decodedText = buffer.toString('utf8');
        }

        decodedText = decodedText.replace(/^\uFEFF/, '');

        let isFirstRow = true;

        Readable.from([decodedText])
            .pipe(csv({
                mapHeaders: ({ header }) => {
                    return String(header || '')
                        .replace(/^\uFEFF/, '')
                        .trim();
                }
            }))
            .on('data', (data) => {
                if (isFirstRow) {
                    isFirstRow = false;
                    return;
                }

                results.push(data);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

runUpdater();
