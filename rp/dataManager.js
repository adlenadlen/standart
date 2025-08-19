// modules/dataManager.js - Модуль управления данными с GitHub источником
export class DataManager {
    constructor() {
        // Используем raw.githubusercontent.com для прямого доступа к файлу
        this.githubUrl = 'https://raw.githubusercontent.com/adlenadlen/psmgeo/main/70/gro/data/rp70.csv';
        
        // Альтернативные URL на случай проблем
        this.fallbackUrls = [
            'https://adlenadlen.github.io/psmgeo/70/gro/data/rp70.csv', // GitHub Pages
            'https://docs.google.com/spreadsheets/d/e/2PACX-1vTa3l-bUfZwy3iCNzVKmawZ_dApKSqMm6yuddAzP3eIkLp5m7zuHydF2UdSkUxKwW0CntEv6EBCxFf7/pub?gid=1125461087&single=true&output=csv' // Google Sheets
        ];
        
        this.columnIndices = {
            CoordSystem: 0,
            Point: 1,
            Xraw: 2,
            Yraw: 3,
            H: 4,
            Info: 5
        };
    }
    
    async fetchData() {
        // Сначала пробуем основной GitHub URL
        try {
            console.log('Загрузка данных из GitHub...');
            const response = await fetch(this.githubUrl, {
                headers: {
                    'Accept': 'text/csv'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const csvText = await response.text();
            console.log('Данные успешно загружены из GitHub');
            return this.parseCSV(csvText);
            
        } catch (error) {
            console.warn('Ошибка загрузки из основного источника:', error.message);
            
            // Пробуем альтернативные источники
            for (let i = 0; i < this.fallbackUrls.length; i++) {
                try {
                    console.log(`Попытка загрузки из резервного источника ${i + 1}...`);
                    const response = await fetch(this.fallbackUrls[i]);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const csvText = await response.text();
                    console.log(`Данные успешно загружены из резервного источника ${i + 1}`);
                    return this.parseCSV(csvText);
                    
                } catch (fallbackError) {
                    console.warn(`Резервный источник ${i + 1} недоступен:`, fallbackError.message);
                }
            }
            
            throw new Error('Не удалось загрузить данные из всех источников');
        }
    }
    
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const records = [];
        
        // Пропускаем заголовок, если он есть
        const startIndex = lines[0].includes('CoordSystem') || lines[0].includes('IZP') ? 0 : 1;
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = this.parseCSVLine(line);
            
            // Проверяем, что у нас достаточно полей
            if (parts.length >= 5) {
                // Обрабатываем случай, когда Info может отсутствовать
                const info = parts.length > 5 ? parts[5]?.trim() : '';
                
                records.push({
                    id: `rp_${i + 1}`,
                    fields: {
                        CoordSystem: parts[0]?.trim().toUpperCase() || 'UNKNOWN',
                        Point: parts[1]?.trim() || '',
                        Xraw: parseFloat(parts[2]) || NaN,
                        Yraw: parseFloat(parts[3]) || NaN,
                        H: parseFloat(parts[4]) || NaN,
                        Info: info
                    }
                });
            }
        }
        
        console.log(`Обработано записей: ${records.length}`);
        return records;
    }
    
    parseCSVLine(line) {
        const parts = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        parts.push(current);
        return parts;
    }
    
    // Метод для получения статистики по системам координат
    getCoordinateSystemStats(records) {
        const stats = {};
        
        records.forEach(record => {
            const system = record.fields.CoordSystem;
            stats[system] = (stats[system] || 0) + 1;
        });
        
        return stats;
    }
}
