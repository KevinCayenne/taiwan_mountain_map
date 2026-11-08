import React from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogContent,
    Divider,
    Icon,
    IconButton,
    Link,
    Stack,
    Typography,
} from '@mui/material';

export const COMPANY = {
    name: '全威精密科技有限公司',
    shortName: '全威精密科技',
    url: 'https://acupro-technology.com/',
    displayUrl: 'acupro-technology.com',
    email: 'service@acupro-technology.com',
    phone: '+886-963-726-389',
    phoneDisplay: '0963-726-389',
    address: '408 臺中市南屯區向上南路一段276號6樓',
};

function ContactRow({ icon, children }) {
    return (
        <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 0.5 }}>
            <Icon fontSize="small" sx={{ color: 'primary.main', mt: '2px' }}>{icon}</Icon>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{children}</Typography>
        </Stack>
    );
}

function AboutDialog({ open, onClose }) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4 } }}>
            <Box sx={{ position: 'relative', px: 3, pt: 3, pb: 2, color: '#fff' }} className="hero-fallback">
                <IconButton onClick={onClose} aria-label="關閉" className="hero-btn" size="small" sx={{ position: 'absolute', top: 12, right: 12 }}>
                    <Icon fontSize="small">close</Icon>
                </IconButton>
                <Box
                    component="img"
                    src={`${process.env.PUBLIC_URL}/m_logo.png`}
                    alt=""
                    sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: '#fff', p: 0.5, mb: 1 }}
                />
                <Typography variant="h6" fontWeight={700}>台灣山岳地圖查詢</Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    為登山客與對山有好奇的人，提供簡單的台灣山岳地圖與登山路線查詢。
                </Typography>
            </Box>
            <DialogContent sx={{ pt: 2 }}>
                <Typography variant="overline" color="text.secondary" fontWeight={700}>網站提供</Typography>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>{COMPANY.name}</Typography>
                <ContactRow icon="language">
                    <Link href={COMPANY.url} target="_blank" rel="noopener">{COMPANY.displayUrl}</Link>
                </ContactRow>
                <ContactRow icon="mail_outline">
                    <Link href={`mailto:${COMPANY.email}`}>{COMPANY.email}</Link>
                </ContactRow>
                <ContactRow icon="call">
                    <Link href={`tel:${COMPANY.phone}`}>{COMPANY.phoneDisplay}</Link>
                </ContactRow>
                <ContactRow icon="place">{COMPANY.address}</ContactRow>

                <Button
                    fullWidth
                    variant="contained"
                    href={COMPANY.url}
                    target="_blank"
                    rel="noopener"
                    endIcon={<Icon>open_in_new</Icon>}
                    sx={{ mt: 1.5 }}
                >
                    前往全威精密科技官網
                </Button>

                <Divider sx={{ my: 2 }} />

                <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.8 }}>
                    山岳資料來源：<Link href="https://hiking.biji.co/" target="_blank" rel="noreferrer">健行筆記</Link><br />
                    山岳照片：<Link href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</Link>（各照片作者與授權標示於照片上）<br />
                    登山路線：© <Link href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</Link> 貢獻者（ODbL）<br />
                    原始碼：<Link href="https://github.com/KevinCayenne/taiwan_mountain_map" target="_blank" rel="noreferrer">GitHub</Link>
                </Typography>
            </DialogContent>
        </Dialog>
    );
}

export default AboutDialog;
